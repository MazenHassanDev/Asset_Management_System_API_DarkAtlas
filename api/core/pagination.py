from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """
    Project-wide pagination.

    - `page_size` = defaults to 20 - (client may override it via the
      `?page_size=` query param.)
    
    - `max_page_size` caps how large a single page can get - avoid client abuse
    """

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
