"""initial_schema_from_models

Revision ID: d39fa7cf25af
Revises:
Create Date: 2026-05-22 17:37:04.947999

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd39fa7cf25af'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use run_sync to create all tables from the SQLAlchemy metadata.
    # This is safe for both fresh installs (creates tables) and existing
    # databases (create_all is a no-op for tables that already exist).
    # Alembic will stamp this revision as applied after the tables exist.
    from hermeshq.models.base import Base
    import hermeshq.models  # noqa: F401 — registers all models on Base.metadata

    def _create_all(connection):
        Base.metadata.create_all(bind=connection)

    op.get_bind().run_sync(_create_all)


def downgrade() -> None:
    # Drop all tables in reverse order (for complete teardown)
    from hermeshq.models.base import Base
    import hermeshq.models  # noqa: F401

    def _drop_all(connection):
        Base.metadata.drop_all(bind=connection)

    op.get_bind().run_sync(_drop_all)
