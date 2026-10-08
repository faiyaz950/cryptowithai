from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('django_orm', '0003_live_trading_and_tv_token'),
    ]

    operations = [
        migrations.AlterField(
            model_name='demoorder',
            name='price',
            field=models.DecimalField(blank=True, decimal_places=12, max_digits=30, null=True),
        ),
        migrations.AlterField(
            model_name='byokorder',
            name='price',
            field=models.DecimalField(blank=True, decimal_places=12, max_digits=30, null=True),
        ),
    ]
