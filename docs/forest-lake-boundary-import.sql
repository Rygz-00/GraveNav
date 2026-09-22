-- GraveNav: import the verified Forest Lake site boundary.
--
-- Run the read-only query first. Confirm the returned row is the existing
-- Forest Lake Memorial Park site. The confirmed site_id is already filled in
-- below as 1.
--
-- This updates one existing public.site row only. It does not create tables,
-- change the schema, or update areas, plots, graves, or map nodes.

-- 1) Read-only confirmation:
select site_id, site_name, address,
       (boundary_geom is not null) as already_has_boundary
from public.site
order by site_id;

-- 2) The confirmed Forest Lake site_id is 1.
-- Run this section only after confirming the correct site row.
begin;

do $$
declare
  matched_site_count integer;
begin
  select count(*)
    into matched_site_count
    from public.site
   where site_id = 1;

  if matched_site_count <> 1 then
    raise exception 'Expected exactly one site row for the supplied site_id';
  end if;
end
$$;

update public.site
   set boundary_geom = st_setsrid(
         st_geomfromgeojson($geojson$
           {"type":"Polygon","coordinates":[[[123.7403651377267,13.12782596874229],[123.7406037367828,13.12784499525643],[123.7407289142752,13.12788688507238],[123.7408464011529,13.12789462764139],[123.740991875098,13.12787949360306],[123.7411041243411,13.12780317205446],[123.7413319691318,13.1275506140704],[123.7417583862641,13.12783968768569],[123.7417441848813,13.12808293463575],[123.742417875768,13.12840957824183],[123.7424363708249,13.12906879532538],[123.7394451801504,13.12934857493199],[123.7396684819317,13.12801018088061],[123.7403651377267,13.12782596874229]]]}
         $geojson$),
         4326
       )::extensions.geography,
       updated_at = current_timestamp
 where site_id = 1;

-- Confirm exactly one row was updated before committing.
-- In Supabase SQL Editor, inspect the result above, then run COMMIT.
-- If anything is unexpected, run ROLLBACK instead.
commit;

-- 3) Read-only verification after commit:
select site_id,
       site_name,
       st_geometrytype(boundary_geom::extensions.geometry) as geometry_type,
       st_srid(boundary_geom::extensions.geometry) as srid,
       st_isvalid(boundary_geom::extensions.geometry) as is_valid
from public.site
where site_id = 1;
