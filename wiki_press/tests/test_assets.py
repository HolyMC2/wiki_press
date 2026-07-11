"""Unit tests for the R2 manual-image store logic (no live R2 needed).

The R2 round-trip (put/presign) is covered by the live lab test once
credentials are configured; here we lock the deterministic parts: image
normalisation, save-time URL rerouting for both spaces, access gating and
the build-time asset detector.
"""

import io
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from wiki_press import assets

PUB = "https://assets.test/manual"
SHA = "a" * 64
CONF = {"manual_assets_public_base": PUB}


def _conf(key, default=None):
    return CONF.get(key, default)


def _png_bytes() -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (12, 8), (200, 40, 40)).save(buf, format="PNG")
    return buf.getvalue()


class TestManualAssets(FrappeTestCase):
    def test_normalize_reencodes_to_webp(self):
        data, ext = assets.normalize_image(_png_bytes(), "shot.png")
        self.assertEqual(ext, "webp")
        from PIL import Image

        self.assertEqual(Image.open(io.BytesIO(data)).format, "WEBP")

    def test_normalize_is_deterministic(self):
        a, _ = assets.normalize_image(_png_bytes(), "x.png")
        b, _ = assets.normalize_image(_png_bytes(), "x.png")
        self.assertEqual(assets._sha(a), assets._sha(b))  # same input -> dedup

    def test_normalize_passthrough_on_non_image(self):
        data, ext = assets.normalize_image(b"not an image", "notes.txt")
        self.assertEqual(data, b"not an image")
        self.assertEqual(ext, "bin")

    def test_manual_image_rerouted_to_public_cdn(self):
        with patch.object(assets, "is_configured", return_value=True), patch.object(
            assets, "_read_local", return_value=b"x"
        ), patch.object(assets, "put_asset", return_value=(SHA, "webp")), patch.object(
            assets, "_conf", side_effect=_conf
        ):
            doc = frappe._dict(route="manual/primeros-pasos/bienvenido", content="![captura](/files/shot.png)")
            self.assertTrue(assets.rewrite_document_images(doc))
            self.assertIn(f"{PUB}/{SHA}.webp", doc.content)
            self.assertNotIn("/files/shot.png", doc.content)

    def test_tech_image_rerouted_to_role_gated_ref(self):
        with patch.object(assets, "is_configured", return_value=True), patch.object(
            assets, "_read_local", return_value=b"x"
        ), patch.object(assets, "put_asset", return_value=(SHA, "webp")), patch.object(
            assets, "_conf", side_effect=_conf
        ):
            doc = frappe._dict(route="manual-tecnico/carga/no-carga", content='<img src="/files/y.jpg">')
            self.assertTrue(assets.rewrite_document_images(doc))
            self.assertIn(f"/api/method/wiki_press.assets.tech_image?sha={SHA}&ext=webp", doc.content)
            self.assertNotIn("assets.test", doc.content)  # tech never uses the public base

    def test_non_manual_space_is_skipped(self):
        with patch.object(assets, "is_configured", return_value=True):
            doc = frappe._dict(route="docs/whatever", content="![x](/files/z.png)")
            self.assertFalse(assets.rewrite_document_images(doc))
            self.assertIn("/files/z.png", doc.content)

    def test_unconfigured_is_noop(self):
        with patch.object(assets, "is_configured", return_value=False):
            doc = frappe._dict(route="manual/g/p", content="![x](/files/z.png)")
            self.assertFalse(assets.rewrite_document_images(doc))
            self.assertIn("/files/z.png", doc.content)

    def test_is_manual_asset_url(self):
        with patch.object(assets, "_conf", side_effect=_conf):
            self.assertTrue(assets.is_manual_asset_url(f"{PUB}/{SHA}.webp"))
            self.assertTrue(
                assets.is_manual_asset_url(f"/api/method/wiki_press.assets.tech_image?sha={SHA}&ext=webp")
            )
            self.assertFalse(assets.is_manual_asset_url("https://evil.example/x.png"))
            self.assertFalse(assets.is_manual_asset_url("/files/local.png"))

    def test_tech_image_rejects_bad_sha(self):
        frappe.form_dict.sha = "not-a-hash"
        frappe.form_dict.ext = "webp"
        with self.assertRaises(frappe.ValidationError):
            assets.tech_image()
        frappe.form_dict.pop("sha", None)
        frappe.form_dict.pop("ext", None)

    def test_tech_access_gate_blocks_guest(self):
        prev = frappe.session.user
        try:
            frappe.session.user = "Guest"
            with self.assertRaises(frappe.PermissionError):
                assets._require_tecnico_access()
        finally:
            frappe.session.user = prev
