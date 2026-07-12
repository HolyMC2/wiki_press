"""Central image store for manual assets, backed by Cloudflare R2.

Why this exists
---------------
The git distribution (git_publish -> hub -> git_pull) carries page *markdown*,
not binary attachments. A site-local ``/files/<img>`` therefore 404s on every
tenant that pulls the page. And even if binaries were synced, a screenshot
copied into N tenant sites is N copies of the same bytes — ~28 MB of manual
imagery becomes ~28 GB across a thousand tenants.

So manual images are stored ONCE, content-addressed, in an R2 bucket:

* ``manual`` space (public):  key ``manual/<sha256>.<ext>``, referenced by an
  absolute CDN URL (``manual_assets_public_base``) that resolves on every site.
* ``manual-tecnico`` space (Técnico-only): key ``tech/<sha256>.<ext>``, kept
  private. Pages reference a stable app URL that role-gates the caller and
  302-redirects to a short-lived presigned R2 URL — the bucket object is never
  public.

The rerouting happens on ``Wiki Document`` save (before_save hook): any local
image ref in a manual/manual-tecnico page is uploaded to R2, deduplicated by
content hash, and the ref is rewritten in place. Fully no-ops when R2 is not
configured, so the app is safe to deploy before credentials exist.
"""

from __future__ import annotations

import hashlib
import io
import re

import frappe

# --- reference patterns in page markdown (both md image + raw <img>) ---
_LOCAL = r"(?:/private)?/files/[^)\s\"']+"
MD_IMG = re.compile(r"(!\[[^\]]*\]\()\s*(" + _LOCAL + r")\s*(\))")
HTML_IMG = re.compile(r"(<img\b[^>]*?\bsrc=[\"'])(" + _LOCAL + r")([\"'])", re.IGNORECASE)
_IMG_EXT = re.compile(r"\.(png|jpe?g|webp|gif|bmp|tiff?)$", re.IGNORECASE)
_SHA_RE = re.compile(r"^[0-9a-f]{64}$")
_EXT_RE = re.compile(r"^[a-z0-9]{2,5}$")

MAX_DIM = 1600          # cap the long edge; screenshots don't need more
WEBP_QUALITY = 82
PRESIGN_TTL = 300       # seconds a tech image URL stays valid


# --------------------------------------------------------------------------- #
# configuration (all secrets live in site_config, never in git)
# --------------------------------------------------------------------------- #
def _conf(key: str, default=None):
    return frappe.conf.get(key, default)


def is_configured() -> bool:
    """Public manual imagery only needs the public bucket; tech serving
    additionally needs r2_bucket_tech (checked at serve/fetch time)."""
    return bool(
        _conf("r2_endpoint")
        and _conf("r2_bucket_public")
        and _conf("r2_access_key_id")
        and _conf("r2_secret_access_key")
    )


def _bucket_public() -> str:
    # public bucket, fronted by the CDN custom domain (manual_assets_public_base)
    return _conf("r2_bucket_public")


def _bucket_tech() -> str:
    # private bucket, no public domain — only ever reached via presigned URLs
    return _conf("r2_bucket_tech")


def _client():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=_conf("r2_endpoint"),
        aws_access_key_id=_conf("r2_access_key_id"),
        aws_secret_access_key=_conf("r2_secret_access_key"),
        region_name="auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
    )


# --------------------------------------------------------------------------- #
# image normalisation + content addressing
# --------------------------------------------------------------------------- #
def normalize_image(data: bytes, filename: str = "") -> tuple[bytes, str]:
    """Fix orientation, cap the long edge, re-encode as WebP. Falls back to the
    original bytes (and its extension) if the payload is not a decodable image.
    Deterministic: identical inputs -> identical output -> identical hash -> dedup."""
    try:
        from PIL import Image, ImageOps

        im = Image.open(io.BytesIO(data))
        im = ImageOps.exif_transpose(im)
        if im.mode in ("P", "RGBA", "LA"):
            im = im.convert("RGBA") if "A" in im.mode else im.convert("RGB")
        elif im.mode != "RGB":
            im = im.convert("RGB")
        im.thumbnail((MAX_DIM, MAX_DIM))  # default resample; robust across Pillow versions
        buf = io.BytesIO()
        im.save(buf, format="WEBP", quality=WEBP_QUALITY, method=6)
        return buf.getvalue(), "webp"
    except Exception:
        m = _IMG_EXT.search(filename or "")
        return data, (m.group(1).lower() if m else "bin")


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def put_asset(data: bytes, is_tech: bool, filename: str = "") -> tuple[str, str]:
    """Normalize + upload (idempotent by content hash). Returns (sha, ext)."""
    ndata, ext = normalize_image(data, filename)
    sha = _sha(ndata)
    key = f"{sha}.{ext}"  # bucket is the security boundary; no shared-bucket prefix
    c = _client()
    bucket = _bucket_tech() if is_tech else _bucket_public()
    try:
        c.head_object(Bucket=bucket, Key=key)
        return sha, ext  # already present -> dedup, no re-upload
    except Exception:
        pass
    c.put_object(
        Bucket=bucket,
        Key=key,
        Body=ndata,
        ContentType=f"image/{ext}",
        CacheControl="public, max-age=31536000, immutable",
    )
    return sha, ext


def public_url(sha: str, ext: str) -> str:
    base = (_conf("manual_assets_public_base") or "").rstrip("/")
    return f"{base}/{sha}.{ext}"


def tech_ref(sha: str, ext: str) -> str:
    """Stable, site-relative ref that survives sync to tenants; resolves through
    the role-gated endpoint below."""
    return f"/api/method/wiki_press.assets.tech_image?sha={sha}&ext={ext}"


# --------------------------------------------------------------------------- #
# save-time rerouting of local image refs
# --------------------------------------------------------------------------- #
def _read_local(url_path: str) -> bytes | None:
    url_path = url_path.split("?", 1)[0]
    if url_path.startswith("/private/files/"):
        rel = url_path[len("/private/files/") :]
        base = frappe.get_site_path("private", "files")
    elif url_path.startswith("/files/"):
        rel = url_path[len("/files/") :]
        base = frappe.get_site_path("public", "files")
    else:
        return None
    import os

    full = os.path.realpath(os.path.join(base, rel))
    if not full.startswith(os.path.realpath(base) + os.sep) or not os.path.isfile(full):
        return None  # traversal guard
    with open(full, "rb") as fh:
        return fh.read()


def _migrate(url: str, is_tech: bool) -> str | None:
    if not _IMG_EXT.search(url.split("?", 1)[0]):
        return None
    data = _read_local(url)
    if data is None:
        return None
    sha, ext = put_asset(data, is_tech, filename=url)
    return tech_ref(sha, ext) if is_tech else public_url(sha, ext)


def _route_space(route: str) -> str | None:
    if route == "manual" or route.startswith("manual/"):
        return "manual"
    if route == "manual-tecnico" or route.startswith("manual-tecnico/"):
        return "manual-tecnico"
    return None


def _doc_space(doc) -> str | None:
    """Which manual space a page belongs to. Prefers doc.route, but on INSERT
    the wiki hasn't generated the route yet at before_save time, so fall back to
    walking parent_wiki_document up to the root group and matching the Wiki
    Space that owns it."""
    space = _route_space(doc.route or "")
    if space:
        return space
    node = doc.parent_wiki_document
    guard = 0
    while node and guard < 50:
        parent = frappe.db.get_value("Wiki Document", node, "parent_wiki_document")
        if not parent:
            break
        node, guard = parent, guard + 1
    if not node:
        return None
    route = frappe.db.get_value("Wiki Space", {"root_group": node}, "route")
    return route if route in ("manual", "manual-tecnico") else None


def rewrite_document_images(doc) -> bool:
    """Reroute local image refs in a manual/manual-tecnico page to R2. Returns
    True if the content changed. No-op unless R2 is configured and the page is
    in one of the two manual spaces."""
    if not is_configured():
        return False
    space = _doc_space(doc)
    if not space:
        return False
    is_tech = space == "manual-tecnico"
    content = doc.content or ""
    changed = False

    def repl(m: re.Match) -> str:
        nonlocal changed
        pre, url, post = m.group(1), m.group(2), m.group(3)
        new = _migrate(url, is_tech)
        if new:
            changed = True
            return pre + new + post
        return m.group(0)

    content = MD_IMG.sub(repl, content)
    content = HTML_IMG.sub(repl, content)
    if changed:
        doc.content = content
    return changed


def reroute_hook(doc, method=None):
    """before_save on Wiki Document. Never blocks a save on asset failure."""
    try:
        rewrite_document_images(doc)
    except Exception:
        frappe.log_error(title="wiki_press: asset reroute failed", message=frappe.get_traceback())


# --------------------------------------------------------------------------- #
# tech image serving: role-gated -> short-lived presigned R2 URL
# --------------------------------------------------------------------------- #
def _require_tecnico_access():
    user = frappe.session.user
    if user == "Guest":
        raise frappe.PermissionError("manual-tecnico requiere autenticación")
    roles = set(frappe.get_roles(user))
    if "System Manager" in roles:
        return
    space = frappe.db.get_value("Wiki Space", {"route": "manual-tecnico"}, "name")
    allowed = set(frappe.get_all("Wiki Space Role", filters={"parent": space}, pluck="role")) if space else set()
    if allowed and (roles & allowed):
        return
    raise frappe.PermissionError("No autorizado para el manual técnico")


@frappe.whitelist(allow_guest=False)
def tech_image():
    """Serve a manual-tecnico image: verify the caller may read the tech space,
    then 302 to a short-lived presigned R2 URL. The R2 object stays private."""
    sha = (frappe.form_dict.get("sha") or "").strip().lower()
    ext = (frappe.form_dict.get("ext") or "webp").strip().lower()
    if not _SHA_RE.match(sha) or not _EXT_RE.match(ext):
        frappe.throw("Referencia de imagen inválida", frappe.ValidationError)
    _require_tecnico_access()
    if not is_configured() or not _bucket_tech():
        frappe.throw("Almacén de imágenes técnico no configurado", frappe.ValidationError)
    url = _client().generate_presigned_url(
        "get_object", Params={"Bucket": _bucket_tech(), "Key": f"{sha}.{ext}"}, ExpiresIn=PRESIGN_TTL
    )
    frappe.local.response["type"] = "redirect"
    frappe.local.response["location"] = url


# --------------------------------------------------------------------------- #
# build-time resolution (used by the book PDF builder)
# --------------------------------------------------------------------------- #
def is_manual_asset_url(url: str) -> bool:
    base = (_conf("manual_assets_public_base") or "").rstrip("/")
    return bool(
        (base and url.startswith(base))
        or "/api/method/wiki_press.assets.tech_image" in url
    )


def fetch_asset_bytes(url: str) -> bytes | None:
    """Resolve a manual-asset URL to raw bytes for embedding into a book PDF.
    Public CDN URL -> plain GET; tech api ref -> authenticated R2 get. Returns
    None on any failure so the builder can fall back to an empty placeholder."""
    try:
        if "/api/method/wiki_press.assets.tech_image" in url:
            from urllib.parse import parse_qs, urlparse

            qs = parse_qs(urlparse(url).query)
            sha = (qs.get("sha", [""])[0]).lower()
            ext = (qs.get("ext", ["webp"])[0]).lower()
            if not _SHA_RE.match(sha) or not _EXT_RE.match(ext) or not _bucket_tech():
                return None
            obj = _client().get_object(Bucket=_bucket_tech(), Key=f"{sha}.{ext}")
            return obj["Body"].read()
        # public CDN
        import urllib.request

        with urllib.request.urlopen(url, timeout=15) as r:  # noqa: S310 (fixed CDN host)
            return r.read()
    except Exception:
        return None
