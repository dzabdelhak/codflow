CREATE OR REPLACE FUNCTION bump_delivery_grid_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  merchant text := CASE WHEN TG_OP = 'DELETE' THEN OLD.merchant_id ELSE NEW.merchant_id END;
BEGIN
  IF current_setting('app.grid_bumped', true) IS DISTINCT FROM merchant THEN
    UPDATE merchants SET delivery_grid_version = delivery_grid_version + 1 WHERE id = merchant;
    PERFORM set_config('app.grid_bumped', merchant, true);
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION lock_delivery_grid() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT delivery_grid_version FROM merchants WHERE id = current_setting('app.merchant_id', true) FOR SHARE
$$;
