// «Manual» entry in the Desk Help menu → contextual manual page.
// Resolution lives server-side (wiki_press.api.get_help_url); this only asks
// for the current doctype (form/list view) and opens the result.
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

	$(document).on("toolbar_setup", function () {
		try {
			const $menu = $(".dropdown-help ul.dropdown-menu");
			if (!$menu.length || $menu.find(".wiki-press-help").length) return;
			$menu.prepend(
				`<li class="wiki-press-help"><a class="dropdown-item" href="#">${__("Manual")}</a></li>`
			);
			$menu.find(".wiki-press-help a").on("click", (e) => {
				e.preventDefault();
				openManual();
			});
		} catch (e) {
			// Navbar markup drift must never break the Desk
			console.warn("wiki_press help menu injection skipped", e);
		}
	});
})();
