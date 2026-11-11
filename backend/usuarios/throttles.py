"""
Límites de intentos de login.

- Por USUARIO (email o usuario): frena que alguien adivine el PIN de 6 dígitos de una persona.
- Por IP: tope amplio, porque muchos celulares salen a internet con la misma IP
  (wifi de la oficina o la red del operador) y no deben bloquearse entre sí.
"""
from rest_framework.throttling import SimpleRateThrottle


class LoginPorUsuarioThrottle(SimpleRateThrottle):
    scope = 'login_usuario'

    def get_cache_key(self, request, view):
        datos = request.data if isinstance(request.data, dict) else {}
        ident = datos.get('usuario') or datos.get('email')
        if not isinstance(ident, str) or not ident.strip():
            return None  # sin identificador no hay a quién limitar (la validación lo rechazará)
        ident = ident.strip().lower()
        if datos.get('usuario'):
            # El técnico entra con usuario O código: contar por persona, para que alternar
            # entre ambos no duplique los intentos permitidos.
            from django.db.models import Q

            from .models import Tecnico
            pk = Tecnico.objects.filter(Q(usuario__iexact=ident) | Q(codigo__iexact=ident))                 .order_by('id').values_list('pk', flat=True).first()
            if pk is not None:
                ident = f'tecnico-{pk}'
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class LoginPorIPThrottle(SimpleRateThrottle):
    scope = 'login_ip'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}
