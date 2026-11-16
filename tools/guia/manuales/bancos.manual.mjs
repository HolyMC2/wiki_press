// The Bancos manual (PLAN §12): its guides by level. The first set is «¿Por qué no me cuadra el banco?».
export default {
  manual: 'bancos',
  titulo: 'Bancos',
  subtitulo: '¿Por qué no me cuadra el banco?',
  para_que: 'Bancos junta tus cuentas de banco, tus tarjetas y tu efectivo, y te dice si tus libros dicen lo mismo que el banco.',
  niveles: {
    1: { aprendes: 'Saber de un vistazo si cada cuenta cuadra con el banco.', guias: ['bancos/cuadra-mi-banco'] },
    2: { aprendes: 'Ligar con un toque lo que ya está en el banco y en tus libros.', guias: ['bancos/ligar-lo-que-ya-esta'] },
    3: { aprendes: 'Entender cada razón de la diferencia y qué hacer con ella.', guias: ['bancos/por-que-no-cuadra'] },
    4: { aprendes: 'Conectar el banco para que todo llegue solo, y decidir quién liga.', guias: [] },
  },
}
