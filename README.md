# Sounda

Web app (instalable en el móvil) para descubrir qué serie o película estás viendo, guardarla en tu biblioteca con fichas tipo IMDb/TMDB y seguir tus capítulos.

## Estado

| Paso | Qué incluye | Estado |
| --- | --- | --- |
| 1 | Elegir cómo reconocer el contenido | Hecho: por diálogos con IA |
| 2 | Web base: búsqueda, fichas TMDB, login y biblioteca | Hecho |
| 3 | Botón "Escuchar": micrófono → texto → IA → TMDB → biblioteca | Hecho |
| 4 | Seguimiento de capítulos estilo TV Time | Pendiente |

## Tecnología

- **Next.js 15** (App Router) + Tailwind, desplegable gratis en Vercel.
- **TMDB** para fichas, pósters, reparto, temporadas, tráiler y "dónde ver".
- **Supabase** (plan gratuito) para login por enlace al email y la base de datos de la biblioteca.
- **Reconocimiento por diálogos**: el navegador transcribe lo que escucha con la Web Speech API (gratis, Chrome y Safari, también en el móvil) y **Claude** deduce la serie o película, temporada y capítulo. Después se confirma con TMDB.

## Cómo funciona el reconocimiento

1. El usuario toca el botón y el móvil escucha hasta 15 segundos, en español o en inglés.
2. El texto va a `/api/recognize` (solo con sesión iniciada, porque cada uso tiene costo).
3. Claude devuelve hasta 3 candidatos con su nivel de confianza.
4. Cada candidato se busca en TMDB y, si es una serie con capítulo, se trae el nombre del episodio.
5. Se guarda en el historial (`recognitions`) y, si la confianza no es baja, en la biblioteca marcado como "Descubierto".

Costo estimado: alrededor de 1 a 3 centavos de dólar por reconocimiento (estimación, conviene medirlo con uso real). Funciona mejor con títulos conocidos y escenas con diálogo; con música o silencio no puede reconocer nada.

## Puesta en marcha

1. **TMDB**: crea una cuenta en themoviedb.org, ve a *Settings → API* y copia el **API Read Access Token**.
2. **Supabase**: crea un proyecto en supabase.com.
   - En *SQL Editor*, pega y ejecuta `supabase/migrations/0001_library.sql` y después `0002_recognitions.sql`.
   - En *Authentication → URL Configuration*, pon tu dominio (por ejemplo `https://sounda.vercel.app`) como *Site URL* y agrega `https://TU-DOMINIO/auth/callback` en *Redirect URLs* (y `http://localhost:3000/auth/callback` para pruebas locales).
   - En *Project Settings → API* copia la URL y la `anon` key.
3. **Claude**: crea una API key en console.anthropic.com y carga algo de saldo.
4. Copia `.env.example` a `.env.local` y completa los valores.
5. Local: `npm install` y `npm run dev`, luego abre http://localhost:3000.
6. Producción: importa el repositorio en Vercel y carga las mismas variables de entorno.

Sin las variables la web arranca igual y muestra un aviso de qué falta conectar.

## Estructura

- `src/lib/tmdb.ts`: cliente de TMDB (solo servidor, el token nunca llega al navegador).
- `src/lib/supabase/`: sesión de Supabase en el servidor.
- `src/app/actions.ts`: añadir/quitar de la biblioteca, login y logout.
- `src/app/title/[type]/[id]`: la ficha de cada serie o película.
- `src/lib/identify.ts`: la consulta a Claude que adivina el título.
- `src/app/api/recognize`: une Claude, TMDB y la biblioteca.
- `src/components/Listen.tsx`: el botón de escuchar.
- `src/app/library`: la biblioteca del usuario. Lo que llegue por reconocimiento se marca como "Descubierto".
