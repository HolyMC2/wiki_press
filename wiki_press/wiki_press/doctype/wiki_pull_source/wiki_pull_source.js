frappe.ui.form.on("Wiki Pull Source", {
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("Sincronizar ahora"), () => {
			frappe.dom.freeze(__("Sincronizando…"));
			frappe
				.call({ method: "wiki_press.git_pull.pull_now", args: { source: frm.doc.name } })
				.then((r) => {
					const m = r.message || {};
					frappe.show_alert({
						message: m.synced ? __("Sincronizado") : __("No se sincronizó: {0}", [m.reason || ""]),
						indicator: m.synced ? "green" : "orange",
					});
					frm.reload_doc();
				})
				.always(() => frappe.dom.unfreeze());
		}).addClass("btn-primary");
	},
});
