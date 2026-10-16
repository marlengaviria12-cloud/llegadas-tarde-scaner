// URL de la implementacion (deployment) del backend en Apps Script, terminada en /exec.
// Debe estar publicada con acceso "Cualquier persona" para que este fetch funcione.
var URL_BACKEND = 'https://script.google.com/macros/s/AKfycbzfDNKlNReAzKZlGaAWTdWtR-4lbjNnWwUj2tkXNm1sWBaE1zLHujZKtf6r-wpdrtHM/exec';

var video = document.getElementById('video');
var canvas = document.getElementById('canvas');
var contexto = canvas.getContext('2d', { willReadFrequently: true });
var panelMensaje = document.getElementById('panel-mensaje');
var iconoEstado = document.getElementById('icono-estado');
var tituloEstado = document.getElementById('titulo-estado');
var tarjetaDatos = document.getElementById('tarjeta-datos');
var mensajeTexto = document.getElementById('mensaje-texto');
var botonContinuar = document.getElementById('boton-continuar');
var botonReintentar = document.getElementById('boton-reintentar');
var botonCamara = document.getElementById('boton-camara');

var escaneando = false;
var streamActual = null;
var facingModeActual = 'environment';
var ultimoCodigoEscaneado = null;

function iniciarCamara() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    mostrarPanel({
      clase: 'estado-error',
      icono: '⚠️',
      titulo: 'Cámara no disponible',
      mensaje: 'Este navegador no permite acceder a la cámara. Usa una versión reciente de Chrome o Safari.'
    });
    return;
  }

  var restricciones = { video: { facingMode: { ideal: facingModeActual } }, audio: false };

  navigator.mediaDevices.getUserMedia(restricciones)
    .then(function (stream) {
      streamActual = stream;
      video.srcObject = stream;
      escaneando = true;
      requestAnimationFrame(cicloEscaneo);
      detectarVariasCamaras();
    })
    .catch(function (error) {
      manejarErrorCamara(error);
    });
}

function detectarVariasCamaras() {
  if (!navigator.mediaDevices.enumerateDevices) return;
  navigator.mediaDevices.enumerateDevices().then(function (dispositivos) {
    var camaras = dispositivos.filter(function (d) { return d.kind === 'videoinput'; });
    botonCamara.style.display = camaras.length > 1 ? 'block' : 'none';
  });
}

botonCamara.addEventListener('click', function () {
  facingModeActual = facingModeActual === 'environment' ? 'user' : 'environment';
  if (streamActual) {
    streamActual.getTracks().forEach(function (track) { track.stop(); });
  }
  iniciarCamara();
});

function manejarErrorCamara(error) {
  var mensaje = 'No fue posible acceder a la cámara.';
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    mensaje = 'Debes permitir el acceso a la cámara para poder escanear. Revisa los permisos del navegador para este sitio e intenta de nuevo.';
  } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    mensaje = 'No se encontró una cámara en este dispositivo.';
  } else if (error.name === 'NotReadableError') {
    mensaje = 'La cámara está siendo usada por otra aplicación.';
  }
  mostrarPanel({
    clase: 'estado-error',
    icono: '🚫',
    titulo: 'Cámara no disponible',
    mensaje: mensaje
  });
}

function cicloEscaneo() {
  if (!escaneando) return;

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    contexto.drawImage(video, 0, 0, canvas.width, canvas.height);
    var imagen = contexto.getImageData(0, 0, canvas.width, canvas.height);
    var resultado = jsQR(imagen.data, imagen.width, imagen.height);

    if (resultado && resultado.data) {
      escaneando = false;
      ultimoCodigoEscaneado = resultado.data;
      procesarCodigo(resultado.data);
      return;
    }
  }
  requestAnimationFrame(cicloEscaneo);
}

function procesarCodigo(codigo) {
  mostrarPanel({
    clase: 'estado-info',
    spinner: true,
    titulo: 'Verificando...'
  });

  var url = URL_BACKEND + '?codigo=' + encodeURIComponent(codigo);

  fetch(url)
    .then(function (respuesta) {
      if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
      return respuesta.json();
    })
    .then(mostrarResultado)
    .catch(mostrarErrorComunicacion);
}

function mostrarResultado(resultado) {
  if (resultado.exito) {
    mostrarPanel({
      clase: 'estado-exito',
      icono: '✅',
      titulo: 'Llegada tarde registrada',
      datos: datosPersona(resultado.persona, resultado.fecha, resultado.hora, 'Exitoso')
    });
    return;
  }

  switch (resultado.motivo) {
    case 'no_encontrado':
      mostrarPanel({
        clase: 'estado-error',
        icono: '❌',
        titulo: 'Código no reconocido',
        mensaje: 'Este código QR no corresponde a ninguna persona registrada.'
      });
      break;
    case 'inactivo':
      mostrarPanel({
        clase: 'estado-advertencia',
        icono: '⚠️',
        titulo: 'Persona inactiva',
        datos: datosPersona(resultado.persona, null, null, 'Rechazado')
      });
      break;
    case 'duplicado':
      mostrarPanel({
        clase: 'estado-advertencia',
        icono: '⚠️',
        titulo: 'Ya registrado hoy',
        datos: datosPersona(resultado.persona, resultado.fecha, null, 'Ya existía un registro')
      });
      break;
    case 'servidor_ocupado':
      mostrarPanel({
        clase: 'estado-error',
        icono: '⏳',
        titulo: 'Servidor ocupado',
        mensaje: 'Hay otro registro en proceso. Intenta de nuevo en un momento.',
        reintentar: true
      });
      break;
    default:
      mostrarPanel({
        clase: 'estado-error',
        icono: '❌',
        titulo: 'Error al guardar',
        mensaje: 'Ocurrió un error guardando el registro. No se confirmó como exitoso. Intenta de nuevo.',
        reintentar: true
      });
  }
}

function mostrarErrorComunicacion() {
  mostrarPanel({
    clase: 'estado-error',
    icono: '📡',
    titulo: 'Sin conexión con el servidor',
    mensaje: 'No fue posible comunicarse con el servidor. Verifica tu conexión a internet e intenta de nuevo.',
    reintentar: true
  });
}

function datosPersona(persona, fecha, hora, estadoTexto) {
  var filas = [
    ['Nombre', persona.nombreCompleto],
    ['ID', persona.id],
    ['Grado/Grupo', persona.gradoGrupo]
  ];
  if (fecha) filas.push(['Fecha', fecha]);
  if (hora) filas.push(['Hora', hora]);
  filas.push(['Estado', estadoTexto]);
  return filas;
}

function mostrarPanel(opciones) {
  panelMensaje.className = 'visible ' + (opciones.clase || '');
  iconoEstado.innerHTML = opciones.spinner ? '<div class="spinner"></div>' : (opciones.icono || '');
  tituloEstado.textContent = opciones.titulo || '';

  if (opciones.datos) {
    tarjetaDatos.style.display = 'block';
    tarjetaDatos.innerHTML = opciones.datos.map(function (fila) {
      return '<div class="fila-dato"><span>' + fila[0] + '</span><span>' + fila[1] + '</span></div>';
    }).join('');
  } else {
    tarjetaDatos.style.display = 'none';
  }

  if (opciones.mensaje) {
    mensajeTexto.style.display = 'block';
    mensajeTexto.textContent = opciones.mensaje;
  } else {
    mensajeTexto.style.display = 'none';
  }

  var esEstadoFinal = !!(opciones.datos || opciones.mensaje) && !opciones.spinner;
  botonContinuar.style.display = esEstadoFinal && !opciones.reintentar ? 'block' : 'none';
  botonReintentar.style.display = opciones.reintentar ? 'block' : 'none';
}

botonContinuar.addEventListener('click', function () {
  panelMensaje.className = '';
  escaneando = true;
  requestAnimationFrame(cicloEscaneo);
});

botonReintentar.addEventListener('click', function () {
  if (ultimoCodigoEscaneado) {
    procesarCodigo(ultimoCodigoEscaneado);
  } else {
    panelMensaje.className = '';
    escaneando = true;
    requestAnimationFrame(cicloEscaneo);
  }
});

iniciarCamara();
