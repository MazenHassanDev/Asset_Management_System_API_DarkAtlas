import json

from django.core.management.base import BaseCommand, CommandError

from assets.services.ingest import ingest
from tenants.models import Organization


class Command(BaseCommand):
    help = "Seed assets for an organization from a JSON file (same ingest path as the import endpoint)."

    def add_arguments(self, parser):
        parser.add_argument("file", help="Path to a JSON file holding an array of asset records.")
        parser.add_argument("--org", required=True, help="Name of the organization to import into.")

    def handle(self, *args, **options):
        # Resolve the org first so we fail fast before touching the file.
        try:
            organization = Organization.objects.get(name=options["org"])
        except Organization.DoesNotExist:
            raise CommandError(
                f"Organization '{options['org']}' not found. Create it with: "
                f"manage.py create_org \"{options['org']}\""
            )

        # File reading lives here, not in the service — graceful failures, no traceback.
        path = options["file"]
        try:
            with open(path) as fh:
                records = json.load(fh)
        except FileNotFoundError:
            raise CommandError(f"File not found: {path}")
        except json.JSONDecodeError as exc:
            raise CommandError(f"Invalid JSON in {path}: {exc}")

        if not isinstance(records, list):
            raise CommandError("Top-level JSON must be an array of asset records.")

        summary = ingest(organization, records)

        self.stdout.write(self.style.SUCCESS(
            f"Imported into '{organization.name}' ({organization.id})"
        ))
        self.stdout.write(f"  batch_id:              {summary['batch_id']}")
        self.stdout.write(f"  created:               {summary['created']}")
        self.stdout.write(f"  updated:               {summary['updated']}")
        self.stdout.write(f"  skipped:               {summary['skipped']}")
        self.stdout.write(f"  relationships_created: {summary['relationships_created']}")

        if summary["errors"]:
            self.stdout.write(self.style.WARNING(f"\n{len(summary['errors'])} row(s) rejected:"))
            for err in summary["errors"]:
                self.stdout.write(self.style.WARNING(f"  [{err['index']}] {err['reason']}"))

        if summary["warnings"]:
            self.stdout.write(self.style.WARNING(f"\n{len(summary['warnings'])} warning(s):"))
            for warn in summary["warnings"]:
                self.stdout.write(self.style.WARNING(f"  {warn['reason']}"))
