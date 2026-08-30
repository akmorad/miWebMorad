# rh-mint-sniper

Bot de mint de NFT para Robinhood Chain (cadena EVM). CLI en Node.js, sin
servicios externos: la clave privada se cifra en local y las únicas peticiones
de red van a los RPC que tú configures.

```bash
npm install
npm run setup     # asistente interactivo
npm run doctor    # mide tus RPC y verifica la configuración
npm run snipe     # simulación por defecto
npm run snipe -- --live   # envía transacciones reales
```

## Antes de nada: lee esto

Este repositorio se escribió a partir de un hilo promocional que enlazaba a otro
bot. **Ese hilo tiene todas las marcas de una estafa de las que roban claves**:
promesas de rentabilidad ("mints gratis que se venden por $100+"), una cifra de
velocidad sin unidad ni referencia ("90% más rápido"), un repositorio recién
creado y una petición de clave privada. El patrón es exactamente el de un
*drainer*. Aquí no se ha copiado ni ejecutado nada de ese código.

Aun usando este bot, ten presente:

- **Nadie puede garantizarte un mint.** Este código reduce la latencia de tu
  transacción. No controla cuánta gente compite, ni el orden del secuenciador,
  ni si la colección tiene lista blanca, límite por billetera o un contrato que
  revierte por motivos que no puedes prever.
- **La mayoría de los mints gratuitos no valen nada.** Que unos pocos se hayan
  revendido caros es supervivencia estadística, no el caso normal.
- **Usa una billetera nueva y dedicada**, con solo el gas que vayas a gastar.
  Una billetera de sniping es una billetera desechable.
- **Empieza en testnet.** El asistente la selecciona por defecto.
- Y lo obvio: nadie de este proyecto te va a pedir nunca tu clave privada ni tu
  frase semilla por mensaje directo.

## Sobre los datos de la cadena

El código **no lleva ningún chainId ni RPC de Robinhood Chain "quemado"**. Es
deliberado: publicar un chainId inventado es la forma más rápida de que firmes
una transacción para la cadena equivocada. Tú pegas tu RPC en el asistente, el
bot lee `eth_chainId` por el cable y lo fija en el config. A partir de ahí,
cualquier RPC que responda con otro chainId aborta la ejecución antes de firmar
nada.

Si prefieres precargarlos:

```bash
export RH_TESTNET_RPC="https://tu-rpc-testnet,https://respaldo"
export RH_MAINNET_RPC="https://tu-rpc-mainnet"
```

## De dónde sale la velocidad

La afirmación "X% más rápido" no significa nada sin decir *respecto a qué parte*.
Lo que este bot optimiza, concretamente:

**1. Pre-firma.** Todo el trabajo caro —resolver la función de mint, estimar
comisiones, leer el nonce, construir el calldata, firmar— ocurre *antes* del
disparo. Cuando la venta abre, en la ruta crítica solo queda un
`eth_sendRawTransaction`. Un bot que firma en el momento paga varios viajes de
ida y vuelta al RPC justo cuando más caros son.

**2. Difusión paralela.** La misma transacción firmada sale hacia todos tus RPC a
la vez. Es el mismo hash por todos los caminos, así que **no hay riesgo de
mintear dos veces**: el primero que entre gana y los demás devuelven
`already known`, que el bot reconoce como el eco de su propia transacción y no
como un fallo.

**3. Selección activa de RPC.** Cada endpoint se mide por latencia mediana y
retraso de bloque. Un RPC rapidísimo pero desincronizado te daría un nonce viejo,
así que se penaliza el retraso (250 ms equivalentes por bloque) además de la
latencia bruta.

**4. Sin sorpresas de transporte.** `staticNetwork` evita un `eth_chainId` extra
antes de cada llamada y `batchMaxCount: 1` impide que ethers agrupe peticiones y
añada latencia en la ruta crítica.

**Lo que el bot NO hace: pujar por gas.** En una cadena con secuenciador FCFS
(primero en llegar, primero servido) el orden lo decide el momento de llegada, no
la propina. Subir el gas ahí no te adelanta: solo te hace pagar de más por el
mismo sitio en la cola. Por eso `maxFeePerGas` y `maxPriorityFeePerGas` aquí son
*topes de seguridad*, no una puja — y el bot aborta antes de firmar si los
superaría.

## Seguridad de la clave privada

- Se cifra con **AES-256-GCM**; la clave de cifrado se deriva de tu contraseña
  con **scrypt (N=2¹⁷)** y nunca se guarda.
- El keystore se escribe con permisos `600` en `.rh-sniper/keystore.json`, que
  está en `.gitignore`.
- Al escribirla no se muestra en pantalla ni queda en el historial del shell.
- **Cero telemetría.** Compruébalo tú mismo:

  ```bash
  grep -rn "fetch\|https://" src/
  ```

  La única llamada de red de verdad es la de `src/opensea.js`, que es opcional
  (requiere que tú definas `OPENSEA_API_KEY`) y solo envía el slug público de la
  colección que has pegado — nunca tu clave, tu dirección ni tu configuración.
  Las otras dos coincidencias son texto, no código: un mensaje de error en
  `wizard.js` y un comentario en `keystore.js`. Todo lo demás sale por
  `ethers`, contra tus RPC.

## Disparadores

| Modo | Cuándo usarlo |
|---|---|
| `state` *(recomendado)* | Simula el mint con `eth_call` hasta que deja de revertir. Es el más fiable: no depende de que la colección exponga un flag público. |
| `timestamp` | Hora de apertura anunciada. Duerme hasta ~500 ms antes y luego afina, porque un `setTimeout` largo se desvía decenas de ms. |
| `block` | La apertura está atada a un número de bloque. |
| `now` | La venta ya está abierta. |

## Topes de gasto

Se evalúan sobre el **peor caso** (`gasLimit` completo al `maxFeePerGas`, más el
precio del mint), nunca sobre una estimación optimista, y **antes** de firmar:

- `maxSpendPerTxEth` — tope por transacción
- `maxTotalSpendEth` — tope de la sesión entera, contando todos los intentos
- también aborta si tu saldo no cubre el peor caso

## Instalación en Android (Termux)

```bash
pkg install -y git
git clone <este-repo> && cd miWebMorad
bash scripts/termux-setup.sh
```

Ejecuta `termux-wake-lock` antes de un mint largo: si no, Android dormirá el
proceso justo cuando abra la venta. Para un mint disputado, un VPS cerca del
secuenciador le gana a cualquier teléfono con datos móviles.

## Pruebas

```bash
npm test
```

16 pruebas contra un servidor JSON-RPC falso en memoria: cifrado del keystore,
orden del pool por latencia y retraso, rechazo de RPC en otra cadena, difusión
paralela, pre-firma, topes de gasto, resolución de la función de mint y lectura
de contraseñas multibyte.

## Estructura

```
src/index.js        CLI: setup, doctor, snipe
src/wizard.js       asistente interactivo
src/keystore.js     cifrado AES-256-GCM + scrypt
src/rpc/pool.js     medición, orden y difusión paralela
src/fees.js         comisiones EIP-1559 con topes duros
src/mint/detect.js  inspección del contrato y de la función de mint
src/mint/calldata.js  construcción del calldata
src/mint/watcher.js   disparadores
src/mint/sender.js    pre-firma, barreras de gasto, confirmación
src/opensea.js      resolución opcional de URL de colección
```

## Aviso

Software para uso propio y bajo tu responsabilidad. Interactúa con contratos
inteligentes y mueve fondos reales; puedes perderlos. Verifica siempre el
contrato antes de mintear y haz tu propia investigación.
