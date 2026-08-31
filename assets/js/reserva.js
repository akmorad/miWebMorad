/* ==========================================================================
   Hotel Almara — landing de reserva.
   Flujo en tres pasos: elegir habitación → datos del huésped → pago.
   Los precios se recalculan en cuanto cambian fechas o número de huéspedes.
   ========================================================================== */
(function () {
  'use strict';

  var A = window.Almara;
  if (!A) return;

  var $ = A.$;
  var $$ = A.$$;

  var estado = A.leerEstado();
  var paso = 1;

  var form = $('#buscador-reserva');
  var contenedorOpciones = $('#opciones');

  /* ------------------------------------------------ Lectura del buscador --- */

  function fechas() {
    return {
      entrada: A.desdeISO(estado.entrada),
      salida: A.desdeISO(estado.salida),
      huespedes: Number(estado.huespedes) || 2,
    };
  }

  function sincronizarDesdeFormulario() {
    if (!form) return;
    var entrada = $('[name="entrada"]', form);
    var salida = $('[name="salida"]', form);
    var huespedes = $('[name="huespedes"]', form);
    if (entrada && entrada.value) estado.entrada = entrada.value;
    if (salida && salida.value) estado.salida = salida.value;
    if (huespedes) estado.huespedes = Number(huespedes.value) || 2;
    A.guardarEstado(estado);
  }

  /* ------------------------------------------ Comparativa de habitaciones --- */

  function pintarOpciones() {
    var f = fechas();
    var noches = A.noches(f.entrada, f.salida);

    var resumenBusqueda = $('#resumen-busqueda');
    if (resumenBusqueda) {
      resumenBusqueda.textContent =
        noches > 0
          ? noches + (noches === 1 ? ' noche · ' : ' noches · ') + f.huespedes +
            (f.huespedes === 1 ? ' huésped' : ' huéspedes')
          : 'Elige unas fechas válidas para ver los precios.';
    }

    if (!contenedorOpciones) return;
    if (noches <= 0) {
      contenedorOpciones.innerHTML =
        '<p style="color:var(--texto-suave)">La fecha de salida debe ser posterior a la de entrada.</p>';
      return;
    }

    contenedorOpciones.innerHTML = A.HABITACIONES.map(function (hab) {
      var p = A.presupuesto(hab, f.entrada, f.salida, f.huespedes);
      var quedan = A.disponibilidad(hab, f.entrada);
      var cabe = f.huespedes <= hab.capacidad;
      var elegida = estado.habitacion === hab.id;

      var aviso = '';
      if (!cabe) {
        aviso = '<p class="opcion__aviso">No admite ' + f.huespedes + ' huéspedes (máximo ' + hab.capacidad + ').</p>';
      } else if (quedan <= 2) {
        aviso = '<p class="opcion__aviso">Solo quedan ' + quedan + (quedan === 1 ? ' habitación' : ' habitaciones') + ' para estas fechas.</p>';
      }

      return [
        '<article class="opcion' + (elegida ? ' opcion--elegida' : '') + (cabe ? '' : ' opcion--agotada') + '" data-habitacion="' + hab.id + '">',
        '  <div class="opcion__medio"><img src="assets/img/' + hab.imagen + '" alt="' + hab.nombre + '" width="1600" height="1200" loading="lazy"></div>',
        '  <div>',
        '    <h3>' + hab.nombre + '</h3>',
        '    <p class="opcion__resumen">' + hab.metros + ' m² · hasta ' + hab.capacidad + ' huéspedes. ' + hab.resumen + '</p>',
        '    <ul class="opcion__amenities">',
        hab.amenities.map(function (a) { return '<li class="etiqueta">' + a + '</li>'; }).join(''),
        '    </ul>',
        aviso,
        '  </div>',
        '  <div class="opcion__precio">',
        '    <p class="opcion__unidad">Media por noche</p>',
        '    <p class="opcion__importe">' + A.euros(p.media) + '</p>',
        '    <p class="opcion__total">' + A.euros(p.total) + ' en total, impuestos incluidos</p>',
        '    <button class="boton ' + (elegida ? 'boton--contorno' : 'boton--principal') + ' boton--pequeno" type="button"' +
             (cabe ? '' : ' disabled') + ' data-elegir="' + hab.id + '">' +
             (elegida ? 'Seleccionada' : 'Elegir') + '</button>',
        '  </div>',
        '</article>',
      ].join('');
    }).join('');

    $$('[data-elegir]', contenedorOpciones).forEach(function (boton) {
      boton.addEventListener('click', function () {
        estado.habitacion = boton.getAttribute('data-elegir');
        A.guardarEstado(estado);
        pintarOpciones();
        pintarResumen();
        irAPaso(2);
      });
    });
  }

  /* ------------------------------------------------------ Resumen lateral --- */

  function habitacionElegida() {
    for (var i = 0; i < A.HABITACIONES.length; i++) {
      if (A.HABITACIONES[i].id === estado.habitacion) return A.HABITACIONES[i];
    }
    return null;
  }

  function pintarResumen() {
    var f = fechas();
    var hab = habitacionElegida();
    var n = A.noches(f.entrada, f.salida);

    $('#resumen-entrada').textContent = A.fechaLarga(f.entrada);
    $('#resumen-salida').textContent = A.fechaLarga(f.salida);
    $('#resumen-huespedes').textContent = f.huespedes + (f.huespedes === 1 ? ' huésped' : ' huéspedes');

    var lineaAlojamiento = $('#linea-alojamiento');
    var etiquetaNoches = n + (n === 1 ? ' noche' : ' noches');

    if (!hab || n <= 0) {
      $('#resumen-habitacion').textContent = 'Elige una habitación';
      $('#resumen-metros').textContent = 'Hotel Almara · Tarifa';
      lineaAlojamiento.innerHTML = '<span>Alojamiento</span><span>—</span>';
      $('#resumen-iva').textContent = '—';
      $('#resumen-tasa').textContent = '—';
      $('#resumen-total').textContent = '—';
      return;
    }

    var p = A.presupuesto(hab, f.entrada, f.salida, f.huespedes);
    $('#resumen-habitacion').textContent = hab.nombre;
    $('#resumen-metros').textContent = hab.metros + ' m² · ' + etiquetaNoches;
    $('#resumen-imagen').src = 'assets/img/' + hab.imagen;
    $('#resumen-imagen').alt = hab.nombre;
    lineaAlojamiento.innerHTML =
      '<span>' + etiquetaNoches + ' × ' + A.euros(p.media) + '</span><span>' + A.euros(p.base) + '</span>';
    $('#resumen-iva').textContent = A.euros(p.impuestos);
    $('#resumen-tasa').textContent = A.euros(p.tasa);
    $('#resumen-total').textContent = A.euros(p.total);
  }

  /* ------------------------------------------------------- Navegación UI --- */

  function irAPaso(nuevo) {
    paso = nuevo;
    $$('[data-paso]').forEach(function (seccion) {
      seccion.hidden = Number(seccion.getAttribute('data-paso')) !== nuevo;
    });
    $$('[data-indicador]').forEach(function (indicador) {
      var numero = Number(indicador.getAttribute('data-indicador'));
      indicador.classList.toggle('paso--activo', numero === nuevo);
      indicador.classList.toggle('paso--hecho', numero < nuevo);
    });

    var pasos = $('#pasos');
    if (pasos) pasos.hidden = nuevo === 4;

    // Al cambiar de paso llevamos el foco arriba: si no, el usuario en móvil
    // se queda mirando el resumen sin ver que la vista ha cambiado.
    var destino = $('[data-paso="' + nuevo + '"]');
    if (destino) {
      var y = destino.getBoundingClientRect().top + window.scrollY - 110;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      var titulo = destino.querySelector('h2');
      if (titulo) {
        titulo.setAttribute('tabindex', '-1');
        titulo.focus({ preventScroll: true });
      }
    }
  }

  $$('[data-volver]').forEach(function (boton) {
    boton.addEventListener('click', function () {
      irAPaso(Number(boton.getAttribute('data-volver')));
    });
  });

  /* --------------------------------------------------------- Validación --- */

  function marcarError(campo, mensaje) {
    var aviso = $('[data-error-de="' + campo.id + '"]');
    if (aviso) aviso.textContent = mensaje || '';
    if (campo.type !== 'checkbox') campo.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
    return !mensaje;
  }

  function validarTexto(campo, minimo, mensaje) {
    var valor = campo.value.trim();
    return marcarError(campo, valor.length >= minimo ? '' : mensaje);
  }

  function validarCorreo(campo) {
    var valor = campo.value.trim();
    var vale = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor);
    return marcarError(campo, vale ? '' : 'Escribe un correo válido.');
  }

  function validarTelefono(campo) {
    var digitos = campo.value.replace(/\D/g, '');
    return marcarError(campo, digitos.length >= 9 ? '' : 'Escribe un teléfono con al menos 9 dígitos.');
  }

  /** Algoritmo de Luhn: la comprobación estándar de un número de tarjeta. */
  function luhn(numero) {
    var suma = 0;
    var alterna = false;
    for (var i = numero.length - 1; i >= 0; i--) {
      var d = Number(numero.charAt(i));
      if (alterna) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      suma += d;
      alterna = !alterna;
    }
    return suma % 10 === 0;
  }

  /* -------------------------------------------- Paso 2: datos del huésped --- */

  var formHuesped = $('#form-huesped');
  if (formHuesped) {
    formHuesped.addEventListener('submit', function (e) {
      e.preventDefault();
      var nombre = $('#h-nombre');
      var apellidos = $('#h-apellidos');
      var correo = $('#h-correo');
      var telefono = $('#h-telefono');
      var condiciones = $('#h-condiciones');

      var ok = [
        validarTexto(nombre, 2, 'Indica tu nombre.'),
        validarTexto(apellidos, 2, 'Indica tus apellidos.'),
        validarCorreo(correo),
        validarTelefono(telefono),
        marcarError(condiciones, condiciones.checked ? '' : 'Debes aceptar las condiciones para continuar.'),
      ].every(Boolean);

      if (!ok) {
        var primero = formHuesped.querySelector('[aria-invalid="true"]') || condiciones;
        if (primero) primero.focus();
        return;
      }
      irAPaso(3);
    });
  }

  /* ---------------------------------------------------------- Paso 3: pago --- */

  var numero = $('#p-numero');
  if (numero) {
    // Agrupa el número de tarjeta de cuatro en cuatro mientras se escribe.
    numero.addEventListener('input', function () {
      var limpio = numero.value.replace(/\D/g, '').slice(0, 19);
      numero.value = limpio.replace(/(.{4})/g, '$1 ').trim();
    });
  }

  var caducidad = $('#p-caducidad');
  if (caducidad) {
    caducidad.addEventListener('input', function () {
      var limpio = caducidad.value.replace(/\D/g, '').slice(0, 4);
      caducidad.value = limpio.length > 2 ? limpio.slice(0, 2) + '/' + limpio.slice(2) : limpio;
    });
  }

  var cvc = $('#p-cvc');
  if (cvc) {
    cvc.addEventListener('input', function () {
      cvc.value = cvc.value.replace(/\D/g, '').slice(0, 4);
    });
  }

  function validarCaducidad(campo) {
    var partes = campo.value.split('/');
    var mes = Number(partes[0]);
    var anio = Number(partes[1]);
    if (!(partes.length === 2 && mes >= 1 && mes <= 12 && partes[1].length === 2)) {
      return marcarError(campo, 'Usa el formato MM/AA.');
    }
    var hoy = new Date();
    var limite = new Date(2000 + anio, mes, 0); // último día del mes indicado
    return marcarError(campo, limite >= hoy ? '' : 'La tarjeta está caducada.');
  }

  function localizador() {
    var letras = '';
    for (var i = 0; i < 6; i++) letras += String(Math.floor(Math.random() * 10));
    return 'ALM-' + letras;
  }

  var formPago = $('#form-pago');
  if (formPago) {
    formPago.addEventListener('submit', function (e) {
      e.preventDefault();
      var titular = $('#p-titular');
      var digitos = numero.value.replace(/\D/g, '');

      var ok = [
        validarTexto(titular, 3, 'Indica el titular de la tarjeta.'),
        marcarError(numero, digitos.length >= 13 && luhn(digitos) ? '' : 'El número de tarjeta no es válido.'),
        validarCaducidad(caducidad),
        marcarError(cvc, cvc.value.length >= 3 ? '' : 'El CVC tiene 3 o 4 dígitos.'),
      ].every(Boolean);

      if (!ok) {
        var primero = formPago.querySelector('[aria-invalid="true"]');
        if (primero) primero.focus();
        return;
      }

      var boton = $('#boton-pagar');
      boton.disabled = true;
      boton.textContent = 'Confirmando…';

      // Pequeña espera para que el paso de confirmación se sienta real.
      window.setTimeout(function () {
        confirmar();
        boton.disabled = false;
        boton.textContent = 'Confirmar reserva';
      }, 900);
    });
  }

  function confirmar() {
    var f = fechas();
    var hab = habitacionElegida();
    if (!hab) return;
    var p = A.presupuesto(hab, f.entrada, f.salida, f.huespedes);

    $('#localizador').textContent = localizador();
    $('#confirmacion-detalle').innerHTML = [
      '<div class="resumen__linea"><span>Habitación</span><span>' + hab.nombre + '</span></div>',
      '<div class="resumen__linea"><span>Entrada</span><span>' + A.fechaLarga(f.entrada) + ' · desde las 15:00</span></div>',
      '<div class="resumen__linea"><span>Salida</span><span>' + A.fechaLarga(f.salida) + ' · hasta las 12:00</span></div>',
      '<div class="resumen__linea"><span>Huéspedes</span><span>' + f.huespedes + '</span></div>',
      '<div class="resumen__linea resumen__linea--fuerte"><span>Total</span><span>' + A.euros(p.total) + '</span></div>',
    ].join('');

    irAPaso(4);
  }

  /* ------------------------------------------------------------ Arranque --- */

  function refrescar() {
    sincronizarDesdeFormulario();
    pintarOpciones();
    pintarResumen();
  }

  if (form) {
    // El buscador de esta página recalcula en vez de navegar a otra.
    form.addEventListener('submit', function (e) { e.preventDefault(); refrescar(); });
    form.addEventListener('almara:cambio', refrescar);
  }

  /*
   * almara.js rellena los campos del buscador desde su propio listener de
   * DOMContentLoaded. Nos enganchamos al mismo evento —y después, porque
   * almara.js se carga antes— para leer ya los valores definitivos.
   */
  function arrancar() {
    sincronizarDesdeFormulario();
    pintarOpciones();
    pintarResumen();
    if (estado.habitacion && habitacionElegida()) irAPaso(2);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
