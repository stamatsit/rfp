-- Rollback for 013. Deletes every vote; ideas and saved ideas are untouched.
DROP TABLE IF EXISTS listening_idea_votes;
