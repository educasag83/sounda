# Sounda

Web app (instalable en el móvil) para descubrir qué serie o película estás viendo, guardarla en tu biblioteca con fichas tipo IMDb/TMDB y seguir tus capítulos.

## Estado

| Paso | Qué incluye | Estado |
| --- | --- | --- |
| 1 | Elegir cómo reconocer el contenido | Hecho: por diálogos con IA |
| 2 | Web base: búsqueda, fichas TMDB, login y biblioteca | Hecho |
| 3 | Botón "Escuchar": micrófono → texto → IA → TMDB → biblioteca | Pendiente |
| 4 | Seguimiento de capítulos estilo TV Time | Pendiente |

## Tecnología

- **Next.js 15** (App Router) + Tailwind, desplegable gratis en Vercel.
- **TMDB** para fichas, pósters, reparto, temporadas, tráiler y "dónde ver".
- **Supabase** (plan gratuito) para login por enlace al email y la base de datos de la biblioteca.

## Puesta en marcha

1. **TMDB**: crea una cuenta en themoviedb.org, ve a *Settings → API* y copia el **API Read Access Token**.
2. **Supabase**: crea un proyecto en supabase.com.
   - En *SQL Editor*, pega y ejecuta `supabase/migrations/0001_library.sql`.
   - En *Authentication → URL Configuration*, pon tu dominio (por ejemplo `https://sounda.vercel.app`) como *Site URL* y agrega `https://TU-DOMINIO/auth/callback` en *Redirect URLs* (y `http://localhost:3000/auth/callback` para pruebas locales).
   - En *Project Settings → API* copia la URL y la `anon` key.
3. Copia `.env.example` a `.env.local` y completa los valores.
4. Local: `npm install` y `npm run dev`, luego abre http://localhost:3000.
5. Producción: importa el repositorio en Vercel y carga las mismas variables de entorno.

Sin las variables la web arranca igual y muestra un aviso de qué falta conectar.

## Estructura

- `src/lib/tmdb.ts`: cliente de TMDB (solo servidor, el token nunca llega al navegador).
- `src/lib/supabase/`: sesión de Supabase en el servidor.
- `src/app/actions.ts`: añadir/quitar de la biblioteca, login y logout.
- `src/app/title/[type]/[id]`: la ficha de cada serie o película.
- `src/app/library`: la biblioteca del usuario. Lo que llegue por reconocimiento se marca como "Descubierto".
