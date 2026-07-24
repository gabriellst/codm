--
-- PostgreSQL database dump
--


-- Dumped from database version 17.10
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: gateway; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA gateway;


--
-- Name: shared; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA shared;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: channels; Type: TABLE; Schema: gateway; Owner: -
--

CREATE TABLE gateway.channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    platform text NOT NULL,
    name text NOT NULL,
    owner_remote_id text DEFAULT ''::text NOT NULL,
    credentials jsonb DEFAULT '{}'::jsonb NOT NULL,
    version bigint DEFAULT 0 NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: gateway; Owner: -
--

CREATE TABLE gateway.messages (
    id uuid NOT NULL,
    channel_id uuid NOT NULL,
    remote_id text NOT NULL,
    platform_message_id text NOT NULL,
    direction text NOT NULL,
    platform text NOT NULL,
    sender_remote_id text NOT NULL,
    content jsonb NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    delivered_at timestamp with time zone,
    seen_at timestamp with time zone,
    edited_at timestamp with time zone,
    deleted_at timestamp with time zone,
    version bigint DEFAULT 0 NOT NULL
);


--
-- Name: remote_memberships; Type: TABLE; Schema: gateway; Owner: -
--

CREATE TABLE gateway.remote_memberships (
    channel_id uuid NOT NULL,
    group_id text NOT NULL,
    member_id text NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    joined_at timestamp with time zone NOT NULL
);


--
-- Name: remotes; Type: TABLE; Schema: gateway; Owner: -
--

CREATE TABLE gateway.remotes (
    channel_id uuid NOT NULL,
    remote_id text NOT NULL,
    type text NOT NULL,
    platform text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    avatar_url text,
    is_blocked boolean DEFAULT false NOT NULL,
    pinned_at timestamp with time zone,
    archived boolean DEFAULT false NOT NULL,
    mute_expiration timestamp with time zone,
    marked_as_unread boolean DEFAULT false NOT NULL,
    unread_message_count integer DEFAULT 0 NOT NULL,
    last_message_at timestamp with time zone,
    last_message_id uuid,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    version bigint DEFAULT 0 NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: shared; Owner: -
--

CREATE TABLE shared.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    entity_id text,
    owner_id text,
    payload jsonb NOT NULL,
    source text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: idempotency_keys; Type: TABLE; Schema: shared; Owner: -
--

CREATE TABLE shared.idempotency_keys (
    key text NOT NULL,
    scope text NOT NULL,
    response_body jsonb,
    response_status integer,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: outbox; Type: TABLE; Schema: shared; Owner: -
--

CREATE TABLE shared.outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    entity_id text,
    owner_id text,
    payload jsonb NOT NULL,
    source text NOT NULL,
    processed_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: scheduled_commands; Type: TABLE; Schema: shared; Owner: -
--

CREATE TABLE shared.scheduled_commands (
    id text NOT NULL,
    name text NOT NULL,
    input jsonb NOT NULL,
    run_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    lease_until timestamp with time zone,
    repeat_every_ms integer,
    dead_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: channels channels_pkey; Type: CONSTRAINT; Schema: gateway; Owner: -
--

ALTER TABLE ONLY gateway.channels
    ADD CONSTRAINT channels_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: gateway; Owner: -
--

ALTER TABLE ONLY gateway.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: remote_memberships remote_memberships_channel_id_group_id_member_id_pk; Type: CONSTRAINT; Schema: gateway; Owner: -
--

ALTER TABLE ONLY gateway.remote_memberships
    ADD CONSTRAINT remote_memberships_channel_id_group_id_member_id_pk PRIMARY KEY (channel_id, group_id, member_id);


--
-- Name: remotes remotes_channel_id_remote_id_pk; Type: CONSTRAINT; Schema: gateway; Owner: -
--

ALTER TABLE ONLY gateway.remotes
    ADD CONSTRAINT remotes_channel_id_remote_id_pk PRIMARY KEY (channel_id, remote_id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: shared; Owner: -
--

ALTER TABLE ONLY shared.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: idempotency_keys idempotency_keys_key_scope_pk; Type: CONSTRAINT; Schema: shared; Owner: -
--

ALTER TABLE ONLY shared.idempotency_keys
    ADD CONSTRAINT idempotency_keys_key_scope_pk PRIMARY KEY (key, scope);


--
-- Name: outbox outbox_pkey; Type: CONSTRAINT; Schema: shared; Owner: -
--

ALTER TABLE ONLY shared.outbox
    ADD CONSTRAINT outbox_pkey PRIMARY KEY (id);


--
-- Name: scheduled_commands scheduled_commands_pkey; Type: CONSTRAINT; Schema: shared; Owner: -
--

ALTER TABLE ONLY shared.scheduled_commands
    ADD CONSTRAINT scheduled_commands_pkey PRIMARY KEY (id);


--
-- Name: idx_channels_owner_id; Type: INDEX; Schema: gateway; Owner: -
--

CREATE INDEX idx_channels_owner_id ON gateway.channels USING btree (owner_id);


--
-- Name: idx_channels_owner_platform; Type: INDEX; Schema: gateway; Owner: -
--

CREATE INDEX idx_channels_owner_platform ON gateway.channels USING btree (owner_id, platform);


--
-- Name: idx_messages_channel; Type: INDEX; Schema: gateway; Owner: -
--

CREATE INDEX idx_messages_channel ON gateway.messages USING btree (channel_id, occurred_at DESC NULLS LAST);


--
-- Name: idx_messages_channel_platform; Type: INDEX; Schema: gateway; Owner: -
--

CREATE UNIQUE INDEX idx_messages_channel_platform ON gateway.messages USING btree (channel_id, platform_message_id);


--
-- Name: idx_messages_channel_remote_occurred; Type: INDEX; Schema: gateway; Owner: -
--

CREATE INDEX idx_messages_channel_remote_occurred ON gateway.messages USING btree (channel_id, remote_id, occurred_at DESC NULLS LAST) WHERE (deleted_at IS NULL);


--
-- Name: idx_messages_remote; Type: INDEX; Schema: gateway; Owner: -
--

CREATE INDEX idx_messages_remote ON gateway.messages USING btree (channel_id, remote_id, occurred_at DESC NULLS LAST);


--
-- Name: idx_remotes_avatar_missing; Type: INDEX; Schema: gateway; Owner: -
--

CREATE INDEX idx_remotes_avatar_missing ON gateway.remotes USING btree (channel_id, remote_id) WHERE ((avatar_url IS NULL) AND (deleted_at IS NULL));


--
-- Name: idx_remotes_last_message_at; Type: INDEX; Schema: gateway; Owner: -
--

CREATE INDEX idx_remotes_last_message_at ON gateway.remotes USING btree (channel_id, last_message_at DESC NULLS LAST);


--
-- Name: idx_remotes_pinned; Type: INDEX; Schema: gateway; Owner: -
--

CREATE INDEX idx_remotes_pinned ON gateway.remotes USING btree (channel_id, pinned_at DESC NULLS LAST) WHERE (pinned_at IS NOT NULL);


--
-- Name: idx_remotes_type; Type: INDEX; Schema: gateway; Owner: -
--

CREATE INDEX idx_remotes_type ON gateway.remotes USING btree (channel_id, type);


--
-- Name: events_billing_webhook_received_entity_unq; Type: INDEX; Schema: shared; Owner: -
--

CREATE UNIQUE INDEX events_billing_webhook_received_entity_unq ON shared.events USING btree (entity_id) WHERE (name = 'billing.webhook.received'::text);


--
-- Name: events_entity_idx; Type: INDEX; Schema: shared; Owner: -
--

CREATE INDEX events_entity_idx ON shared.events USING btree (entity_id, occurred_at);


--
-- Name: events_name_idx; Type: INDEX; Schema: shared; Owner: -
--

CREATE INDEX events_name_idx ON shared.events USING btree (name, occurred_at);


--
-- Name: idempotency_expires_idx; Type: INDEX; Schema: shared; Owner: -
--

CREATE INDEX idempotency_expires_idx ON shared.idempotency_keys USING btree (expires_at);


--
-- Name: outbox_unprocessed_idx; Type: INDEX; Schema: shared; Owner: -
--

CREATE INDEX outbox_unprocessed_idx ON shared.outbox USING btree (source, processed_at, created_at);


--
-- Name: scheduled_commands_due_idx; Type: INDEX; Schema: shared; Owner: -
--

CREATE INDEX scheduled_commands_due_idx ON shared.scheduled_commands USING btree (run_at) WHERE (dead_at IS NULL);


--
-- Name: remote_memberships remote_memberships_channel_id_group_id_remotes_channel_id_remot; Type: FK CONSTRAINT; Schema: gateway; Owner: -
--

ALTER TABLE ONLY gateway.remote_memberships
    ADD CONSTRAINT remote_memberships_channel_id_group_id_remotes_channel_id_remot FOREIGN KEY (channel_id, group_id) REFERENCES gateway.remotes(channel_id, remote_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


