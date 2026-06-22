from django.core.management.base import BaseCommand

from tenants.models import ApiKey, Organization


class Command(BaseCommand):
    help = "Create an organization (tenant) and mint an API key for it."

    def add_arguments(self, parser):
        parser.add_argument("name", help="Organization name, e.g. 'Acme Corp'")
        parser.add_argument(
            "--key-name",
            default="",
            help="Optional label for the API key (e.g. 'scanner').",
        )

    def handle(self, *args, **options):
        name = options["name"]
        org, created = Organization.objects.get_or_create(name=name)
        if created:
            self.stdout.write(self.style.SUCCESS(f"Created organization '{org.name}' ({org.id})"))
        else:
            self.stdout.write(self.style.WARNING(f"Organization '{org.name}' already exists ({org.id})"))

        api_key, raw_key = ApiKey.generate(org, name=options["key_name"])
        self.stdout.write(self.style.SUCCESS("\nAPI key created. Store it now — it will NOT be shown again:\n"))
        self.stdout.write(f"  {raw_key}\n")
        self.stdout.write(f"  (prefix {api_key.prefix}, id {api_key.id})")
