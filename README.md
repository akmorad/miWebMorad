# Hotel Almara — sitio web de demostración

Web completa de un hotel boutique ficticio en Tarifa (Cádiz), pensada como
**pieza de muestra**: estática, sin dependencias y lista para enviar por correo
o publicar con un enlace.

> El hotel, sus tarifas y sus opiniones son inventados. La landing de reserva
> no procesa pagos reales ni envía datos a ningún servidor.

## Cómo verla

- **Sin instalar nada:** abre `index.html` con doble clic. Todas las rutas son
  relativas, así que funciona también desde `file://` (por ejemplo, dentro de
  un ZIP adjunto a un correo).
- **Con un servidor local:** `python3 -m http.server` y abre `http://localhost:8000`.
- **Publicada:** sirve la carpeta tal cual en GitHub Pages, Netlify o cualquier
  hosting estático. No hay proceso de compilación.

## Qué incluye

| Página | Contenido |
| --- | --- |
| `index.html` | Hero a pantalla completa con buscador, habitaciones, servicios, guías, testimonios, mapa interactivo y pie |
| `reserva.html` | Landing de reserva en tres pasos con precios en tiempo real |
| `habitaciones.html` | Ficha detallada de los tres tipos de habitación |
| `guias.html` + `guias/*.html` | Sección tipo revista con cuatro guías locales |

### Landing de reserva

- Selector de entrada, salida y número de huéspedes.
- Comparativa de las tres habitaciones con **precio calculado en el momento**:
  temporada (julio y agosto ×1,35; junio y septiembre ×1,15; invierno ×0,85),
  recargo de viernes y sábado (×1,1) y suplemento por huésped adicional (25 €).
- Resumen lateral fijo con desglose de alojamiento, IVA (10 %), tasa turística
  (2,50 € por persona y noche), total y política de cancelación.
- Flujo de tres pasos: elegir habitación → datos del huésped → pago, con
  validación real de formularios (incluido el algoritmo de Luhn en la tarjeta) y
  pantalla de confirmación con localizador.
- Sellos de confianza: pago seguro, mejor precio garantizado y cancelación gratuita.

### Agente de WhatsApp

Presente en todas las páginas, en la esquina inferior derecha. Burbuja circular
con avatar y animación de pulso; al pulsar abre un panel de chat con el mensaje
predefinido *«Hola, soy el asistente de Hotel Almara 🌊 ¿En qué puedo ayudarte
con tu reserva?»* y un enlace a `wa.me` con el texto ya escrito. El número
(`34600123456`, en `assets/js/almara.js`) es de demostración.

## Imágenes

**Todas las ilustraciones son originales.** No hay ni una imagen de banco: se
generan por código como SVG desde `tools/generate-images.mjs`, a partir de una
sola paleta y una misma dirección de luz (sol bajo y cálido a la derecha), que es
lo que las mantiene coherentes entre sí.

```bash
node tools/generate-images.mjs     # regenera assets/img/*.svg
```

El resultado ya está en el repositorio, así que solo hace falta ejecutarlo si se
retocan las escenas. Al ser vectoriales, pesan pocos kilobytes y se ven nítidas
en cualquier pantalla.

## Vídeo para redes

`tools/video/` genera un vídeo vertical de 1080×1920 con la demo, listo para
Instagram Reels o Stories: recorrido por la home, flujo de reserva completo,
agente de WhatsApp y tarjeta de cierre.

```bash
./tools/video/render.sh          # 18 s a 30 fps -> hotel-almara-reel.mp4
./tools/video/render.sh 12 30    # otra duración
```

Cada fotograma se calcula solo a partir de su número (`fotograma.html?f=N`), así
que el render es reproducible y se paraleliza. Para cambiar los rótulos o los
tiempos, edita las constantes `GUION`, `PARADAS` y `ROTULOS` de `fotograma.html`.

## Estructura

```
index.html  reserva.html  habitaciones.html  guias.html
guias/            cuatro artículos de guía local
assets/css/       almara.css — sistema visual completo
assets/js/        almara.js (común) y reserva.js (flujo de reserva)
assets/img/       15 ilustraciones SVG originales
tools/            generador de las ilustraciones y del vídeo para redes
```

## Decisiones técnicas

- **Sin dependencias ni compilación.** HTML, CSS y JavaScript escritos a mano.
  Lo único externo son las tipografías de Google Fonts, con alternativas del
  sistema para que la web se vea bien también sin conexión.
- **Scripts clásicos**, no módulos ES: los módulos quedan bloqueados por CORS al
  abrir la web desde el disco, y la demo tiene que funcionar así.
- **Las animaciones nunca esconden contenido.** El texto solo se oculta para
  animarlo si el JavaScript está activo; si falla, la página se ve entera.
- **Respeta `prefers-reduced-motion`** y se ha comprobado que no hay
  desplazamiento horizontal entre 320 px y 1280 px.

## Personalizar

- **Colores y tipografías:** las variables al principio de `assets/css/almara.css`.
- **Habitaciones y precios:** la constante `HABITACIONES` en `assets/js/almara.js`.
- **Contacto y WhatsApp:** la constante `CONTACTO` en `assets/js/almara.js`.
- **Puntos del mapa:** la constante `PUNTOS` en `assets/js/almara.js`.
