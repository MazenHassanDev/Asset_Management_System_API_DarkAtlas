from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from assets.models import Asset
from tenants.models import Organization


class Command(BaseCommand):
    help = "Flip ACTIVE -> STALE for assets whose last_seen is older than N days."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days", type=int, default=30,
            help="Staleness window: assets not seen in this many days become stale (default: 30).",
        )
        parser.add_argument(
            "--org",
            help="Limit to one organization by name (default: all organizations).",
        )
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report how many assets would be marked stale without writing.",
        )

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=options["days"])
        queryset = Asset.objects.filter(status=Asset.Status.ACTIVE, last_seen__lt=cutoff)

        # Optional org scoping — resolve only if --org was passed. A management
        # command is run by a trusted operator, so "all orgs" is the default
        # (matches a scheduled cron job); --org just narrows the blast radius.
        if options["org"]:
            try:
                organization = Organization.objects.get(name=options["org"])
            except Organization.DoesNotExist:
                raise CommandError(f"Organization '{options['org']}' not found.")
            queryset = queryset.filter(organization=organization)

        scope = f" in '{options['org']}'" if options["org"] else ""

        if options["dry_run"]:
            self.stdout.write(
                f"[dry-run] {queryset.count()} asset(s){scope} would be marked stale "
                f"(older than {options['days']} days)."
            )
            return

        # Bulk update: one query, and auto_now is deliberately NOT fired here —
        # marking something stale is not a re-sighting, so last_seen stays put.
        count = queryset.update(status=Asset.Status.STALE)
        self.stdout.write(self.style.SUCCESS(
            f"Marked {count} asset(s){scope} stale (older than {options['days']} days)."
        ))