"""Rutas de la API, montadas bajo /api/v1/ (ver docs/contrato-api.md)."""
from django.urls import path

from jornadas.views import MiEstadoView
from ubicaciones.views import MapaEnVivoView, MisUbicacionesView, RecorridoView
from usuarios.views import (
    LoginAdminView, LoginTecnicoView, MiDispositivoView, MiPerfilView, MiSeguimientoDetenidoView, RefreshView,
)
from usuarios.panel import TecnicoPinView, TecnicosView, TecnicoView
from verificaciones.views import MiResponderVerificacionView, MiVerificacionPendienteView

urlpatterns = [
    # Autenticación
    path('auth/admin/login', LoginAdminView.as_view(), name='auth-admin-login'),
    path('auth/tecnico/login', LoginTecnicoView.as_view(), name='auth-tecnico-login'),
    path('auth/refresh', RefreshView.as_view(), name='auth-refresh'),

    # App móvil (rol técnico)
    path('mi/estado', MiEstadoView.as_view(), name='mi-estado'),
    path('mi/ubicaciones', MisUbicacionesView.as_view(), name='mi-ubicaciones'),
    path('mi/perfil', MiPerfilView.as_view(), name='mi-perfil'),
    path('mi/dispositivo', MiDispositivoView.as_view(), name='mi-dispositivo'),
    path('mi/seguimiento-detenido', MiSeguimientoDetenidoView.as_view(), name='mi-seguimiento-detenido'),
    path('mi/verificacion-pendiente', MiVerificacionPendienteView.as_view(), name='mi-verificacion-pendiente'),
    path('mi/verificaciones/<int:pk>/responder', MiResponderVerificacionView.as_view(),
         name='mi-verificacion-responder'),

    # Panel admin (rol administrador)
    path('mapa-en-vivo', MapaEnVivoView.as_view(), name='mapa-en-vivo'),
    path('tecnicos', TecnicosView.as_view(), name='tecnicos'),
    path('tecnicos/<int:pk>', TecnicoView.as_view(), name='tecnico'),
    path('tecnicos/<int:pk>/pin', TecnicoPinView.as_view(), name='tecnico-pin'),
    path('tecnicos/<int:pk>/recorrido', RecorridoView.as_view(), name='tecnico-recorrido'),
]
