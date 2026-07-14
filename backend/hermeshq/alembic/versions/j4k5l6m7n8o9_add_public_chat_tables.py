"""add public chat tables

Revision ID: j4k5l6m7n8o9
Revises: i3j4k5l6m7n8
Create Date: 2026-07-08
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "j4k5l6m7n8o9"
down_revision = "i3j4k5l6m7n8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "public_chat_api_keys",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("key_hash", sa.String(128), unique=True, nullable=False, index=True),
        sa.Column("key_prefix", sa.String(12), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("agent_id", sa.String(36), sa.ForeignKey("agents.id", ondelete="CASCADE"), index=True),
        sa.Column("allowed_domains", postgresql.ARRAY(sa.String), server_default="{}"),
        sa.Column("requests_per_month", sa.Integer, server_default="1000"),
        sa.Column("tokens_per_month", sa.Integer, server_default="100000"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "public_chat_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("api_key_id", sa.String(36), sa.ForeignKey("public_chat_api_keys.id", ondelete="CASCADE"), index=True),
        sa.Column("agent_id", sa.String(36), sa.ForeignKey("agents.id", ondelete="CASCADE"), index=True),
        sa.Column("session_token", sa.String(64), unique=True, nullable=False, index=True),
        sa.Column("status", sa.String(20), server_default="active"),
        sa.Column("last_activity", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("ttl_minutes", sa.Integer, server_default="10"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "public_chat_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("public_chat_sessions.id", ondelete="CASCADE"), index=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "public_chat_transcripts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), nullable=False, index=True),
        sa.Column("api_key_id", sa.String(36), nullable=False, index=True),
        sa.Column("agent_id", sa.String(36), nullable=False),
        sa.Column("messages_json", sa.JSON, server_default="[]"),
        sa.Column("archived_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("public_chat_transcripts")
    op.drop_table("public_chat_messages")
    op.drop_table("public_chat_sessions")
    op.drop_table("public_chat_api_keys")
