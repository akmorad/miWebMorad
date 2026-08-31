/* ==========================================================================
   Hotel Almara — comportamiento común a todas las páginas.

   Se carga como script clásico (sin módulos ES) a propósito: así la demo
   funciona tanto publicada como abierta directamente desde el disco con
   file://, donde los módulos quedarían bloqueados por CORS.
   ========================================================================== */
(function () {
  'use strict';

  // Marca de que hay JS: hasta aquí el CSS mantiene todo visible.
  document.documentElement.classList.add('js');

  /* ------------------------------------------------------------ Datos --- */

  var CONTACTO = {
    telefono: '+34 956 68 12 40',
    whatsapp: '34600123456', // número de demostración
    correo: 'reservas@hotelalmara.es',
    direccion: 'Paseo de la Alameda 12, 11380 Tarifa, Cádiz',
  };

  var HABITACIONES = [
    {
      id: 'vista-mar',
      nombre: 'Habitación Vista Mar',
      precio: 120,
      imagen: 'habitacion-vista-mar.svg',
      resumen: 'Ventanal en arco sobre el Atlántico, cama de 1,80 m y terraza compartida.',
      metros: 28,
      capacidad: 2,
      amenities: ['Vistas al mar', 'Cama king 180 cm', 'Terraza compartida', 'Baño con ducha de lluvia'],
    },
    {
      id: 'suite-almara',
      nombre: 'Suite Almara',
      precio: 220,
      imagen: 'suite-almara.svg',
      resumen: 'La suite principal, con salón, terraza privada y bañera exenta frente al Estrecho.',
      metros: 46,
      capacidad: 3,
      amenities: ['Terraza privada', 'Salón independiente', 'Bañera exenta', 'Desayuno incluido'],
    },
    {
      id: 'jardin',
      nombre: 'Habitación Jardín',
      precio: 95,
      imagen: 'habitacion-jardin.svg',
      resumen: 'Planta baja abierta al patio de buganvillas, fresca y silenciosa.',
      metros: 22,
      capacidad: 2,
      amenities: ['Salida al patio', 'Cama queen 160 cm', 'Zona de sombra', 'Ideal para estancias largas'],
    },
  ];

  var IVA = 0.1; // IVA turístico español
  var TASA_POR_PERSONA = 2.5; // tasa turística por persona y noche

  /* -------------------------------------------------------- Utilidades --- */

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function aISO(fecha) {
    var d = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }

  function desdeISO(texto) {
    if (!texto) return null;
    var p = texto.split('-');
    if (p.length !== 3) return null;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? null : d;
  }

  function sumarDias(fecha, dias) {
    var d = new Date(fecha.getTime());
    d.setDate(d.getDate() + dias);
    return d;
  }

  function noches(entrada, salida) {
    if (!entrada || !salida) return 0;
    return Math.max(0, Math.round((salida - entrada) / 86400000));
  }

  function fechaLarga(fecha) {
    if (!fecha) return '—';
    return fecha.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function euros(valor) {
    return valor.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
  }

  function eurosCortos(valor) {
    return valor.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  }

  /* --------------------------------------------------- Motor de precios --- */

  /**
   * Coeficiente de temporada. Julio y agosto son el pico en Tarifa; el
   * invierno se compensa a la baja.
   */
  function coeficienteTemporada(fecha) {
    var mes = fecha.getMonth();
    if (mes === 6 || mes === 7) return 1.35;
    if (mes === 5 || mes === 8) return 1.15;
    if (mes === 3 || mes === 4 || mes === 9) return 1;
    return 0.85;
  }

  function precioNoche(habitacion, fecha, huespedes) {
    var precio = habitacion.precio * coeficienteTemporada(fecha);
    var dia = fecha.getDay();
    if (dia === 5 || dia === 6) precio *= 1.1; // viernes y sábado
    var extra = Math.max(0, (huespedes || 2) - 2);
    precio += extra * 25;
    return Math.round(precio * 100) / 100;
  }

  /** Presupuesto completo de una estancia, impuestos incluidos. */
  function presupuesto(habitacion, entrada, salida, huespedes) {
    var total = noches(entrada, salida);
    var base = 0;
    var lineas = [];
    for (var i = 0; i < total; i++) {
      var dia = sumarDias(entrada, i);
      var importe = precioNoche(habitacion, dia, huespedes);
      base += importe;
      lineas.push({ fecha: dia, importe: importe });
    }
    base = Math.round(base * 100) / 100;
    var impuestos = Math.round(base * IVA * 100) / 100;
    var tasa = Math.round(TASA_POR_PERSONA * (huespedes || 2) * total * 100) / 100;
    return {
      noches: total,
      lineas: lineas,
      base: base,
      media: total ? Math.round((base / total) * 100) / 100 : 0,
      impuestos: impuestos,
      tasa: tasa,
      total: Math.round((base + impuestos + tasa) * 100) / 100,
    };
  }

  /**
   * Disponibilidad simulada pero estable: las mismas fechas devuelven
   * siempre el mismo resultado, de modo que la demo no "parpadea".
   */
  function disponibilidad(habitacion, entrada) {
    if (!entrada) return 4;
    var semilla = 0;
    var clave = habitacion.id + aISO(entrada);
    for (var i = 0; i < clave.length; i++) semilla = (semilla * 31 + clave.charCodeAt(i)) % 100000;
    return 1 + (semilla % 4);
  }

  /* ------------------------------------------------ Estado de la reserva --- */

  var CLAVE = 'almara:reserva';

  function leerEstado() {
    var base = { entrada: null, salida: null, huespedes: 2, habitacion: null };
    try {
      var guardado = window.sessionStorage.getItem(CLAVE);
      if (guardado) {
        var d = JSON.parse(guardado);
        base.entrada = d.entrada || null;
        base.salida = d.salida || null;
        base.huespedes = d.huespedes || 2;
        base.habitacion = d.habitacion || null;
      }
    } catch (e) {
      /* Modo privado o almacenamiento bloqueado: seguimos con los valores por defecto. */
    }
    var params = new URLSearchParams(window.location.search);
    if (params.get('entrada')) base.entrada = params.get('entrada');
    if (params.get('salida')) base.salida = params.get('salida');
    if (params.get('huespedes')) base.huespedes = Number(params.get('huespedes')) || base.huespedes;
    if (params.get('habitacion')) base.habitacion = params.get('habitacion');

    if (!base.entrada || !base.salida || desdeISO(base.salida) <= desdeISO(base.entrada)) {
      var hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      base.entrada = aISO(sumarDias(hoy, 14));
      base.salida = aISO(sumarDias(hoy, 17));
    }
    return base;
  }

  function guardarEstado(estado) {
    try {
      window.sessionStorage.setItem(CLAVE, JSON.stringify(estado));
    } catch (e) {
      /* Sin almacenamiento la reserva sigue funcionando dentro de la página. */
    }
  }

  /* --------------------------------------------------------- Cabecera --- */

  function iniciarCabecera() {
    var cabecera = $('.cabecera');
    if (!cabecera) return;
    var sobreHero = cabecera.classList.contains('cabecera--sobre-hero');

    function actualizar() {
      var bajado = window.scrollY > 40;
      cabecera.classList.toggle('cabecera--fija', bajado || !sobreHero);
    }
    actualizar();
    window.addEventListener('scroll', actualizar, { passive: true });

    var boton = $('.menu-boton');
    var lista = $('.navegacion__lista');
    if (boton && lista) {
      boton.addEventListener('click', function () {
        var abierto = boton.getAttribute('aria-expanded') === 'true';
        boton.setAttribute('aria-expanded', String(!abierto));
        lista.classList.toggle('navegacion__lista--abierta', !abierto);
        cabecera.classList.toggle('cabecera--fija', !abierto || window.scrollY > 40 || !sobreHero);
      });
      $$('a', lista).forEach(function (enlace) {
        enlace.addEventListener('click', function () {
          boton.setAttribute('aria-expanded', 'false');
          lista.classList.remove('navegacion__lista--abierta');
        });
      });
    }
  }

  /* ------------------------------------------- Aparición al hacer scroll --- */

  function iniciarApariciones() {
    var elementos = $$('.aparece');
    if (!elementos.length) return;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      elementos.forEach(function (el) { el.classList.add('aparece--visible'); });
      return;
    }

    var observador = new IntersectionObserver(
      function (entradas) {
        entradas.forEach(function (entrada) {
          if (!entrada.isIntersecting) return;
          var el = entrada.target;
          // Escalonado dentro de cada grupo: las tarjetas entran en cascada.
          var hermanos = el.parentElement ? $$('.aparece', el.parentElement) : [];
          var indice = Math.max(0, hermanos.indexOf(el));
          el.style.transitionDelay = Math.min(indice, 5) * 90 + 'ms';
          el.classList.add('aparece--visible');
          observador.unobserve(el);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
    );
    elementos.forEach(function (el) { observador.observe(el); });
  }

  /* ------------------------------------------------- Agente de WhatsApp --- */

  var SALUDO = 'Hola, soy el asistente de Hotel Almara 🌊 ¿En qué puedo ayudarte con tu reserva?';

  var SUGERENCIAS = [
    { texto: 'Ver disponibilidad', mensaje: 'Hola, quería consultar disponibilidad para mis fechas.' },
    { texto: 'Precios y ofertas', mensaje: 'Hola, ¿qué tarifas tenéis disponibles?' },
    { texto: 'Cómo llegar', mensaje: 'Hola, ¿cómo llego al hotel desde el aeropuerto de Jerez?' },
  ];

  function enlaceWhatsApp(mensaje) {
    return 'https://wa.me/' + CONTACTO.whatsapp + '?text=' + encodeURIComponent(mensaje);
  }

  function iniciarAgente() {
    if ($('.agente')) return;

    var base = document.body.getAttribute('data-base') || '';
    var avatar = base + 'assets/img/agente-avatar.svg';
    var hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    var contenedor = document.createElement('div');
    contenedor.className = 'agente';
    contenedor.innerHTML = [
      '<div class="agente__panel" id="agente-panel" role="dialog" aria-label="Chat con el asistente de Hotel Almara" aria-modal="false">',
      '  <div class="agente__cabecera">',
      '    <img src="' + avatar + '" alt="" width="42" height="42">',
      '    <div>',
      '      <div class="agente__nombre">Asistente de Hotel Almara</div>',
      '      <div class="agente__estado">En línea · responde en minutos</div>',
      '    </div>',
      '    <button type="button" class="agente__cerrar" aria-label="Cerrar chat">&times;</button>',
      '  </div>',
      '  <div class="agente__conversacion">',
      '    <div class="agente__mensaje">' + SALUDO + '<span class="agente__hora">' + hora + '</span></div>',
      '  </div>',
      '  <div class="agente__pie">',
      '    <div class="agente__sugerencias">',
      SUGERENCIAS.map(function (s) {
        return '<button type="button" class="agente__sugerencia" data-mensaje="' + s.mensaje + '">' + s.texto + '</button>';
      }).join(''),
      '    </div>',
      '    <a class="boton boton--principal boton--bloque" href="' + enlaceWhatsApp(SUGERENCIAS[0].mensaje) + '"',
      '       target="_blank" rel="noopener" data-enlace-whatsapp>Continuar en WhatsApp</a>',
      '  </div>',
      '</div>',
      '<div class="agente__aviso" hidden>' + SALUDO + '</div>',
      '<button type="button" class="agente__burbuja" aria-expanded="false" aria-controls="agente-panel"',
      '        aria-label="Abrir el chat con el asistente de Hotel Almara">',
      '  <span class="agente__pulso"></span><span class="agente__pulso"></span>',
      '  <img src="' + avatar + '" alt="" width="64" height="64">',
      '  <span class="agente__insignia" aria-hidden="true">',
      '    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.25.69-1.42 1.3-1.96 1.35-.5.05-.99.24-3.4-.71-2.86-1.13-4.68-4.05-4.82-4.24-.14-.19-1.15-1.53-1.15-2.92s.73-2.07 1-2.35c.26-.28.57-.35.76-.35h.55c.18 0 .42-.07.65.5.25.6.83 2.07.9 2.22.07.14.12.31.02.5-.09.19-.14.31-.28.48l-.42.49c-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.17-.19.69-.8.87-1.08.19-.28.37-.23.63-.14.25.09 1.62.76 1.9.9.28.14.46.21.53.33.07.11.07.66-.18 1.35Z"/></svg>',
      '  </span>',
      '</button>',
    ].join('');
    document.body.appendChild(contenedor);

    var burbuja = $('.agente__burbuja', contenedor);
    var panel = $('.agente__panel', contenedor);
    var aviso = $('.agente__aviso', contenedor);
    var cerrar = $('.agente__cerrar', contenedor);
    var enlace = $('[data-enlace-whatsapp]', contenedor);

    // El estado vive en una variable, no en las clases del DOM: así no depende
    // de que la animación llegue a ejecutarse.
    var abierto = false;
    var cierre = null;

    function abrir(estado) {
      abierto = estado;
      window.clearTimeout(cierre);
      if (estado) {
        panel.classList.add('agente__panel--montado');
        void panel.offsetWidth; // fuerza el reflujo para que la transición arranque
        panel.classList.add('agente__panel--abierto');
        aviso.hidden = true;
        aviso.classList.remove('agente__aviso--visible');
        var primera = $('.agente__sugerencia', panel);
        if (primera) primera.focus();
      } else {
        panel.classList.remove('agente__panel--abierto');
        cierre = window.setTimeout(function () { panel.classList.remove('agente__panel--montado'); }, 420);
      }
      burbuja.setAttribute('aria-expanded', String(estado));
    }

    burbuja.addEventListener('click', function () { abrir(!abierto); });
    cerrar.addEventListener('click', function () { abrir(false); burbuja.focus(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && abierto) {
        abrir(false);
        burbuja.focus();
      }
    });

    $$('.agente__sugerencia', contenedor).forEach(function (boton) {
      boton.addEventListener('click', function () {
        enlace.setAttribute('href', enlaceWhatsApp(boton.getAttribute('data-mensaje')));
        $$('.agente__sugerencia', contenedor).forEach(function (b) { b.style.borderColor = ''; b.style.color = ''; });
        boton.style.borderColor = 'var(--terracota)';
        boton.style.color = 'var(--terracota-osc)';
      });
    });

    // Llamada de atención discreta: el globo aparece una sola vez por sesión.
    var yaVisto = false;
    try { yaVisto = window.sessionStorage.getItem('almara:aviso') === '1'; } catch (e) { /* sin almacenamiento */ }
    if (!yaVisto) {
      window.setTimeout(function () {
        if (abierto) return;
        aviso.hidden = false;
        // Un tick para que la transición de opacidad se aplique.
        window.requestAnimationFrame(function () { aviso.classList.add('agente__aviso--visible'); });
        try { window.sessionStorage.setItem('almara:aviso', '1'); } catch (e) { /* sin almacenamiento */ }
        window.setTimeout(function () {
          aviso.classList.remove('agente__aviso--visible');
          window.setTimeout(function () { aviso.hidden = true; }, 500);
        }, 8000);
      }, 5200);
    }
  }

  /* ------------------------------------------- Buscador rápido del hero --- */

  function iniciarBuscadores() {
    $$('[data-buscador]').forEach(function (form) {
      var entrada = $('[name="entrada"]', form);
      var salida = $('[name="salida"]', form);
      var estado = leerEstado();
      var hoy = aISO(new Date());

      if (entrada) {
        entrada.min = hoy;
        if (!entrada.value) entrada.value = estado.entrada;
      }
      if (salida) {
        salida.min = aISO(sumarDias(desdeISO(entrada.value) || new Date(), 1));
        if (!salida.value) salida.value = estado.salida;
      }
      var huespedes = $('[name="huespedes"]', form);
      if (huespedes) huespedes.value = String(estado.huespedes);

      // La salida nunca puede caer antes que la entrada.
      if (entrada && salida) {
        entrada.addEventListener('change', function () {
          var e = desdeISO(entrada.value);
          if (!e) return;
          var minimo = sumarDias(e, 1);
          salida.min = aISO(minimo);
          if (!desdeISO(salida.value) || desdeISO(salida.value) <= e) salida.value = aISO(sumarDias(e, 3));
          form.dispatchEvent(new CustomEvent('almara:cambio'));
        });
        salida.addEventListener('change', function () { form.dispatchEvent(new CustomEvent('almara:cambio')); });
      }
      if (huespedes) huespedes.addEventListener('change', function () { form.dispatchEvent(new CustomEvent('almara:cambio')); });

      if (form.hasAttribute('data-navega')) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var destino = form.getAttribute('data-navega') || 'reserva.html';
          var params = new URLSearchParams({
            entrada: entrada ? entrada.value : '',
            salida: salida ? salida.value : '',
            huespedes: huespedes ? huespedes.value : '2',
          });
          guardarEstado({
            entrada: entrada ? entrada.value : null,
            salida: salida ? salida.value : null,
            huespedes: huespedes ? Number(huespedes.value) : 2,
            habitacion: null,
          });
          window.location.href = destino + '?' + params.toString();
        });
      }
    });
  }

  /* ------------------------------------------------------ Mapa de la zona --- */

  var PUNTOS = [
    {
      id: 'hotel',
      nombre: 'Hotel Almara',
      meta: 'Paseo de la Alameda 12 · Tarifa',
      texto: 'Frente al mar, a tres minutos a pie del casco antiguo y con acceso directo a la playa de Los Lances.',
      x: 41,
      y: 41,
      destacado: true,
    },
    {
      id: 'playa',
      nombre: 'Playa de Los Lances',
      meta: '2 min a pie · 7 km de arena',
      texto: 'La playa más larga de Tarifa y el punto de encuentro de kitesurfistas de media Europa.',
      x: 17,
      y: 33,
    },
    {
      id: 'puerto',
      nombre: 'Puerto de Tarifa',
      meta: '10 min a pie · ferry a Tánger',
      texto: 'Salidas diarias a Tánger en 60 minutos. Reservamos los billetes en recepción sin coste.',
      x: 44,
      y: 60,
    },
    {
      id: 'bolonia',
      nombre: 'Ensenada de Bolonia',
      meta: '22 km · 25 min en coche',
      texto: 'Duna de 30 metros y las ruinas romanas de Baelo Claudia, con la mejor luz a última hora.',
      x: 76,
      y: 27,
    },
    {
      id: 'jerez',
      nombre: 'Aeropuerto de Jerez',
      meta: '120 km · 1 h 30 min por la N-340',
      texto: 'Recogida privada por 95 € por trayecto, o autobús Jerez–Tarifa con transbordo en Cádiz.',
      x: 9,
      y: 8,
    },
  ];

  function iniciarMapa() {
    var lienzo = $('.mapa__lienzo');
    var ficha = $('.mapa__ficha');
    if (!lienzo || !ficha) return;

    function pintarFicha(punto) {
      ficha.innerHTML =
        '<h3>' + punto.nombre + '</h3>' +
        '<p class="mapa__ficha__meta">' + punto.meta + '</p>' +
        '<p>' + punto.texto + '</p>';
    }

    PUNTOS.forEach(function (punto) {
      var boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'mapa__punto' + (punto.destacado ? ' mapa__punto--hotel' : '');
      boton.style.left = punto.x + '%';
      boton.style.top = punto.y + '%';
      boton.setAttribute('aria-pressed', punto.destacado ? 'true' : 'false');
      boton.innerHTML = '<span class="mapa__chincheta"></span><span class="mapa__etiqueta">' + punto.nombre + '</span>';
      boton.addEventListener('click', function () {
        $$('.mapa__punto', lienzo).forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        boton.setAttribute('aria-pressed', 'true');
        pintarFicha(punto);
      });
      lienzo.appendChild(boton);
    });

    pintarFicha(PUNTOS[0]);
  }

  /* ------------------------------------------------------------ Boletín --- */

  function iniciarBoletin() {
    $$('[data-boletin]').forEach(function (form) {
      var estado = $('.boletin__estado', form);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var correo = $('input[type="email"]', form);
        if (!correo || !correo.value) return;
        form.reset();
        if (estado) estado.textContent = '¡Gracias! Te escribiremos con las guías y las ofertas de temporada.';
      });
    });
  }

  /* ----------------------------------------------------------- Arranque --- */

  function iniciar() {
    iniciarCabecera();
    iniciarApariciones();
    iniciarAgente();
    iniciarBuscadores();
    iniciarMapa();
    iniciarBoletin();
    $$('[data-anio]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  /* Superficie compartida con la landing de reserva. */
  window.Almara = {
    CONTACTO: CONTACTO,
    HABITACIONES: HABITACIONES,
    IVA: IVA,
    TASA_POR_PERSONA: TASA_POR_PERSONA,
    $: $,
    $$: $$,
    aISO: aISO,
    desdeISO: desdeISO,
    sumarDias: sumarDias,
    noches: noches,
    fechaLarga: fechaLarga,
    euros: euros,
    eurosCortos: eurosCortos,
    precioNoche: precioNoche,
    presupuesto: presupuesto,
    disponibilidad: disponibilidad,
    leerEstado: leerEstado,
    guardarEstado: guardarEstado,
    enlaceWhatsApp: enlaceWhatsApp,
  };
})();
