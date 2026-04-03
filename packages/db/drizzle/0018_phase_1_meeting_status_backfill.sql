UPDATE "meeting_sessions"
SET "status" = CASE
  WHEN "status" = 'live' THEN 'listening'::meeting_session_status
  WHEN "status" IN ('summarizing', 'awaiting_approval', 'executing') THEN 'processing'::meeting_session_status
  WHEN "status" = 'completed' THEN 'ended'::meeting_session_status
  ELSE "status"
END;
