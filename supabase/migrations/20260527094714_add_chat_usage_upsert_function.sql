-- Function to increment chat usage (upsert pattern)
CREATE OR REPLACE FUNCTION increment_chat_usage(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO chat_usage (user_id, message_date, message_count)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, message_date)
  DO UPDATE SET message_count = chat_usage.message_count + 1;
END;
$$;
