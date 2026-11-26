from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("django_orm", "0007_strategybot_tp1"),
    ]

    operations = [
        migrations.AddField(
            model_name="paperbracket",
            name="plan",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
