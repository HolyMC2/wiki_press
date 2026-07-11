frappe.ui.form.on("Wiki Book", {
	refresh(frm) {
		if (frm.is_new()) return;

		frm.add_custom_button(__("Generar PDF"), () => {
			frappe.call({
				method: "wiki_press.api.build_book",
				args: { book: frm.doc.name },
				callback(r) {
					if (!r.message?.task_id) return;
					const task_id = r.message.task_id;
					frappe.show_alert({ message: __("Generando libro…"), indicator: "blue" });
					frappe.realtime.on(`task_complete:${task_id}`, (data) => {
						frappe.realtime.off(`task_complete:${task_id}`);
						frappe.show_alert({ message: __("Libro generado"), indicator: "green" });
						frm.reload_doc();
						if (data?.file_url) window.open(data.file_url, "_blank");
					});
				},
			});
		}).addClass("btn-primary");

		if (frm.doc.last_built_file) {
			frm.add_custom_button(__("Descargar último PDF"), () => {
				window.open(
					`/api/method/wiki_press.api.download_book?book=${encodeURIComponent(frm.doc.name)}`,
					"_blank"
				);
			});
			frm.add_custom_button(__("Copiar enlace público"), () => {
				const url = `${frappe.urllib.get_base_url()}/api/method/wiki_press.api.download_book?book=${encodeURIComponent(frm.doc.name)}`;
				frappe.utils.copy_to_clipboard(url);
			});
		}
	},
});
