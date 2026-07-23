// «Manual» launcher on the Desk → contextual manual page. Resolution lives
// server-side (wiki_press.api.get_help_url); this only asks for the current
// doctype (form/list view) and opens the result.
//
// Frappe v16 retired the top navbar's `.dropdown-help` menu (collapsing
// `body-sidebar` now — labels clipped at 50px), so the old menu injection
// silently no-op'd. Mount a dedicated always-visible launcher on <body>
// instead, sharing one fixed container with doco's «Ayuda» launcher.
(function () {
	function currentContext() {
		const route = frappe.get_route ? frappe.get_route() : [];
		if (route[0] === "Form" || route[0] === "List") {
			return { context_type: "DocType", context_key: route[1] };
		}
		return { context_type: "Desk Page", context_key: route[0] || "app" };
	}

	function openManual() {
		frappe.call({
			method: "wiki_press.api.get_help_url",
			args: currentContext(),
			callback(r) {
				if (r.message) {
					window.open(r.message, "_blank");
				} else {
					frappe.show_alert({ message: __("No hay página del manual para esta vista"), indicator: "orange" });
				}
			},
		});
	}

	function esc(s) {
		if (window.frappe && frappe.utils && frappe.utils.escape_html)
			return frappe.utils.escape_html(s || "");
		return String(s || "").replace(/[&<>"]/g, (c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
	}

	function launcherContainer() {
		let container = document.getElementById("muelle-help-launchers");
		if (!container) {
			container = document.createElement("div");
			container.id = "muelle-help-launchers";
			container.style.cssText =
				"position:fixed;right:16px;bottom:16px;z-index:1030;" +
				"display:flex;flex-direction:column-reverse;gap:8px;";
			document.body.appendChild(container);
		}
		return container;
	}

	function mountLauncher() {
		try {
			if (!window.frappe || !frappe.ui || typeof __ !== "function") return;
			const container = launcherContainer();
			if (container.querySelector(".wiki-press-manual-launcher")) return; // idempotent
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "btn btn-default btn-sm wiki-press-manual-launcher";
			btn.style.cssText =
				"box-shadow:var(--shadow-md,0 2px 8px rgba(0,0,0,.15));" +
				"border-radius:20px;display:flex;align-items:center;gap:6px;";
			btn.setAttribute("aria-label", __("Manual"));
			btn.innerHTML =
				'<span aria-hidden="true">📖</span><span>' + esc(__("Manual")) + "</span>";
			btn.addEventListener("click", (e) => {
				e.preventDefault();
				openManual();
			});
			container.appendChild(btn);
		} catch (e) {
			// A launcher must never break the Desk
			console.warn("wiki_press manual launcher mount skipped", e);
		}
	}

	$(document).on("toolbar_setup", mountLauncher);
	$(mountLauncher);
})();
