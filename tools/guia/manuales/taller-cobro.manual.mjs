// Taller y caja (PLAN §12): one repair order from its anticipo to its charge, by level.
export default {
  manual: 'taller-cobro',
  titulo: 'Taller y caja',
  subtitulo: 'Anticipo, pieza, precio y cobro de una reparación',
  para_que: 'Taller lleva la reparación y caja cobra: el anticipo, la pieza y el precio se registran en la orden, y caja cobra lo que la orden dice.',
  niveles: {
    1: { aprendes: 'Cobrar el anticipo, poner la pieza en la orden y cobrar la orden lista.', guias: ['taller/anticipo-en-caja', 'taller/agregar-pieza', 'taller/cobrar-orden-en-caja'] },
    2: { aprendes: 'Cambiar el precio de una pieza o de la mano de obra sin que se descuadre el cobro.', guias: ['taller/cambiar-precio'] },
    3: { aprendes: 'Qué hacer cuando caja ya cargó el cobro, la orden no cuadra o la pieza ya se vendió.', guias: [] },
    4: { aprendes: 'Encender el cobro en caja y poner el WhatsApp de la tienda en los tickets.', guias: ['taller/encender-cobro-caja', 'taller/whatsapp-en-tickets'] },
  },
}
