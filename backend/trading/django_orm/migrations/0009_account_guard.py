from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("django_orm", "0008_paper_bracket_plan"),
    ]

    operations = [
        migrations.CreateModel(
            name="AccountGuard",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kill_switch", models.BooleanField(default=False)),
                ("flatten", models.BooleanField(default=False)),
                ("max_daily_loss_pct", models.DecimalField(decimal_places=2, default=5, max_digits=6)),
                ("max_open_positions", models.PositiveSmallIntegerField(default=5)),
                ("max_exposure_pct", models.DecimalField(decimal_places=2, default=200, max_digits=7)),
                ("telegram_chat_id", models.CharField(blank=True, default="", max_length=32)),
                ("alerts", models.JSONField(default=list)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="guard", to="django_orm.useraccount")),
            ],
            options={"db_table": "account_guards"},
        ),
    ]
