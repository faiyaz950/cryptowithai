from django.db import migrations, models


def copy_capital_to_equity(apps, schema_editor):
    StrategyBot = apps.get_model("django_orm", "StrategyBot")
    for bot in StrategyBot.objects.all().iterator():
        if bot.equity in (None, 0) and bot.capital is not None:
            bot.equity = bot.capital
            bot.save(update_fields=["equity"])


class Migration(migrations.Migration):
    dependencies = [
        ("django_orm", "0009_account_guard"),
    ]

    operations = [
        migrations.AddField(
            model_name="strategybot",
            name="equity",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=18),
        ),
        migrations.RunPython(copy_capital_to_equity, migrations.RunPython.noop),
    ]
