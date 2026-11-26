from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('django_orm', '0006_strategy_bots'),
    ]

    operations = [
        migrations.AddField(
            model_name='strategybot',
            name='tp1_price',
            field=models.DecimalField(blank=True, decimal_places=12, max_digits=30, null=True),
        ),
        migrations.AddField(
            model_name='strategybot',
            name='tp1_done',
            field=models.BooleanField(default=False),
        ),
    ]
