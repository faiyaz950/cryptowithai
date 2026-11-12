import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('django_orm', '0004_order_price_precision'),
    ]

    operations = [
        migrations.AddField(
            model_name='demoorder',
            name='stop_loss',
            field=models.DecimalField(blank=True, decimal_places=12, max_digits=30, null=True),
        ),
        migrations.AddField(
            model_name='demoorder',
            name='take_profit',
            field=models.DecimalField(blank=True, decimal_places=12, max_digits=30, null=True),
        ),
        migrations.CreateModel(
            name='PaperBracket',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('symbol', models.CharField(max_length=32)),
                ('stop_loss', models.DecimalField(blank=True, decimal_places=12, max_digits=30, null=True)),
                ('take_profit', models.DecimalField(blank=True, decimal_places=12, max_digits=30, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='paper_brackets', to='django_orm.useraccount')),
            ],
            options={
                'db_table': 'paper_brackets',
                'constraints': [models.UniqueConstraint(fields=('user', 'symbol'), name='uniq_paper_bracket')],
            },
        ),
    ]
