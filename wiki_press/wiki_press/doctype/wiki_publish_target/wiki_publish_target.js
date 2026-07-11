frappe.ui.form.on("Wiki Publish Target", {
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("Publicar ahora"), () => {
			frappe.dom.freeze(__("Publicando…"));
			frappe
				.call({ method: "wiki_press.git_publish.publish_now", args: { target: frm.doc.name } })
				.then((r) => {
					const m = r.message || {};
					frappe.show_alert({
						message: m.pushed ? __("Publicado") : __("Sin cambios"),
						indicator: m.pushed ? "green" : "blue",
					});
					frm.reload_doc();
				})
				.always(() => frappe.dom.unfreeze());
		}).addClass("btn-primary");
	},
});
