-- Milestone 3 (capture): who may upload and read voucher photos in the private bucket.
--
-- Object names are "<voucher_id>/<file>". Access follows the voucher:
--   read:   anyone who can see the voucher (vouchers RLS applies inside the subquery)
--   upload: anyone who can still edit it (own draft/queried voucher, or accounts/admin)
-- No update/delete policies: photos are never replaced or deleted (spec §10).

create policy voucher_images_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'voucher-images'
    and exists (select 1 from public.vouchers v where v.id::text = split_part(name, '/', 1))
  );

create policy voucher_images_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'voucher-images'
    and exists (
      select 1 from public.vouchers v
       where v.id::text = split_part(name, '/', 1)
         and ((select public.is_accounts_or_admin())
              or (v.created_by = (select public.current_staff_id()) and v.status in ('draft', 'queried')))
    )
  );
