# Reel Instagram — Página web + CRM + Agentes de WhatsApp

Vídeo vertical **1080×1920 · 39,5 s · 30 fps · H.264** generado por código
(no es IA generativa de vídeo: es una animación web renderizada fotograma a
fotograma, por eso todos los textos, gráficas y la conversación se leen nítidos).

- Vídeo: `out/morad-web-crm-whatsapp-9x16.mp4`
- Portada para el feed: `out/portada.jpg`
- Fuente editable: `scene.html`

## Guion (timeline)

| Tiempo | Escena | Qué se ve |
|---|---|---|
| 0,0 – 4,2 s | **Gancho** | 03:14 de la madrugada · «Tu negocio duerme. Tus clientes no.» · contador de 12 mensajes sin responder |
| 4,2 – 10,8 s | **01 · Página web** | Navegador con `hotelvistamar.com`, cursor que hace clic en «Reservar ahora», fechas 12–14 sep, habitación y precio, versión móvil y badge de carga 0,9 s |
| 10,8 – 22,4 s | **02 · Agentes de WhatsApp** | Conversación real: el cliente pregunta a las 03:14, el agente responde, pide los datos y confirma la **reserva #A-2291 a nombre de Laura Giménez** con indicadores de «escribiendo…» y dobles checks |
| 22,6 – 30,4 s | **03 · CRM** | Panel con KPIs animados (148 reservas, 21.480 €, 87 % ocupación, 4 s de respuesta), gráfica de barras por mes, anillo de ocupación, tabla de reservas y la nueva reserva entrando sola desde WhatsApp |
| 30,6 – 34,0 s | **Resumen** | Web + CRM + Agentes = un solo sistema |
| 34,2 – 39,5 s | **CTA** | «Escribe DEMO en los comentarios» + firma |

## Cómo volver a renderizar

```bash
cd video
npm install
NODE_PATH=/opt/node22/lib/node_modules node render.cjs 30 39.5
```

`render.cjs` abre `scene.html` en Chromium, pausa todas las animaciones CSS y va
moviendo el `currentTime` del timeline global fotograma a fotograma, así que el
resultado es determinista y sin saltos.

Para revisar fotogramas sueltos antes de renderizar entero:

```bash
NODE_PATH=/opt/node22/lib/node_modules node preview.cjs 3.4 8.9 19 28.6
```

## Qué se puede personalizar rápido en `scene.html`

- **Nombre y firma**: busca `MORAD` (aparece en la barra inferior y en el cierre).
- **CTA**: `Escribe DEMO en los comentarios`.
- **Datos del ejemplo**: `Hotel Vista Mar`, `Laura Giménez`, `#A-2291`, importes.
- **Colores**: bloque `:root` (teal `#14B8A6`, cian `#06B6D4`, fondo `#0A1628`).
- **Tiempos**: cada elemento lleva `--d` (segundos del timeline global); las
  escenas llevan `--in` / `--out`.

## Texto sugerido para la publicación

**Versión breve (recomendada):**

> Son las 03:14 y un cliente pregunta si te queda habitación. Si nadie contesta,
> esa reserva se va a la competencia.
>
> Monto el sistema completo: **página web** con reserva directa, **CRM** donde
> entra todo solo y **agentes de WhatsApp** que atienden y reservan 24/7.
>
> Escribe **DEMO** en los comentarios. 👇

**Versión larga:**

> Son las 03:14. Un cliente pregunta si te queda habitación para el finde.
> Si nadie contesta, esa reserva se va a la competencia.
>
> Monto sistemas completos para hoteles, apartamentos y residencias:
> 1️⃣ Página web con reserva directa (sin comisiones de portales)
> 2️⃣ CRM donde entra todo solo: clientes, reservas, ingresos
> 3️⃣ Agentes de WhatsApp que atienden, reservan y confirman 24/7
>
> Escribe **DEMO** en los comentarios y te enseño cómo quedaría en tu negocio.

Hashtags: `#automatizacion #inteligenciaartificial #hoteles #apartamentosturisticos
#crm #whatsappbusiness #agentesia #paginasweb #turismo #negocios`

> Nota: los datos del vídeo (hotel, cliente, cifras) son un ejemplo ficticio de
> demostración, no un caso real de cliente.
