"""episode exclusions

Revision ID: f3a1c9d2e5b7
Revises: b2709cdbfd2f
Create Date: 2026-09-17 02:30:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'f3a1c9d2e5b7'
down_revision: str | None = 'b2709cdbfd2f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('episode_exclusions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('episode_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['episode_id'], ['episodes.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'episode_id', name='uq_episode_exclusion_user_episode')
    )
    op.create_index('ix_episode_exclusions_user_id', 'episode_exclusions', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_episode_exclusions_user_id', table_name='episode_exclusions')
    op.drop_table('episode_exclusions')
