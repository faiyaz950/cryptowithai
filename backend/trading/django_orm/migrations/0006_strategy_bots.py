import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('django_orm', '0005_paper_brackets'),
    ]

    operations = [
        migrations.CreateModel(
            name='StrategyBot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('strategy', models.CharField(default='trend-rider', max_length=32)),
                ('symbol', models.CharField(max_length=32)),
                ('timeframe', models.CharField(default='4h', max_length=8)),
                ('capital', models.DecimalField(decimal_places=2, max_digits=18)),
                ('risk_pct', models.DecimalField(decimal_places=3, max_digits=6)),
                ('params', models.JSONField(default=dict)),
                ('mode', models.CharField(default='paper', max_length=8)),
                ('exchange_account_id', models.BigIntegerField(blank=True, null=True)),
                ('status', models.CharField(db_index=True, default='running', max_length=16)),
                ('started_at', models.DateTimeField()),
                ('entry_time', models.BigIntegerField(blank=True, null=True)),
                ('trade_state', models.CharField(blank=True, default='', max_length=16)),
                ('side', models.CharField(blank=True, default='', max_length=8)),
                ('quantity', models.DecimalField(blank=True, decimal_places=10, max_digits=28, null=True)),
                ('entry_price', models.DecimalField(blank=True, decimal_places=12, max_digits=30, null=True)),
                ('stop_loss', models.DecimalField(blank=True, decimal_places=12, max_digits=30, null=True)),
                ('stop_order_id', models.CharField(blank=True, default='', max_length=64)),
                ('last_bar_time', models.BigIntegerField(blank=True, null=True)),
                ('last_run_at', models.DateTimeField(blank=True, null=True)),
                ('last_error', models.TextField(blank=True, default='')),
                ('events', models.JSONField(default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='strategy_bots', to='django_orm.useraccount')),
            ],
            options={
                'db_table': 'strategy_bots',
                'ordering': ['-created_at'],
            },
        ),
    ]
