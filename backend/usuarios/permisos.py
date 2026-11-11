from rest_framework.permissions import BasePermission

from .autenticacion import TIPO_ADMIN, TIPO_TECNICO


def _tipo(request):
    return getattr(request.user, 'TIPO_USUARIO', None)


class EsAdmin(BasePermission):
    """Solo administradores del panel web."""

    message = 'Solo disponible para administradores.'

    def has_permission(self, request, view):
        return _tipo(request) == TIPO_ADMIN


class EsTecnico(BasePermission):
    """Solo técnicos (app móvil)."""

    message = 'Solo disponible para técnicos.'

    def has_permission(self, request, view):
        return _tipo(request) == TIPO_TECNICO
