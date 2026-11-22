-- Permisos para los usuarios logueados.
-- En proyectos nuevos de Supabase las tablas creadas por SQL pueden no tener
-- permisos para el rol "authenticated", y la app recibe
-- "permission denied for table ...". Las políticas RLS siguen limitando
-- a cada usuario a sus propias filas.
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.library_items, public.recognitions, public.watched_episodes
  to authenticated;
grant usage, select on all sequences in schema public to authenticated;
