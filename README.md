# Clínica Nácar

Proyecto de portafolio de Angel Taipe. **Clínica Nácar es una marca ficticia**: el nombre, el contacto y la dirección son de demostración, y los botones de contacto solo muestran un aviso.

Web de una sola página para un negocio local, con recorrido 3D ligado al scroll, tema claro, vidrio líquido y un armador de citas que prepara un mensaje de WhatsApp.

## Tecnología

- Three.js, con geometría 3D procedural generada por campos de distancia
- JavaScript, CSS y Lenis
- esbuild, para compilar todo en un solo `index.html`

## Uso

`index.html` es el resultado final: se abre con doble clic o se sube a cualquier hosting.

```bash
npm install
npm run geo
npm run build
```

- `npm run geo` regenera la geometría 3D.
- `npm run build` compila `src/` en `index.html`.

Los servicios opcionales se activan en `src/config.js`. Las reseñas se cargan en `src/reviews.js`; con la lista vacía, esa sección queda oculta.

## Créditos

Las fotos de la sección facial son de Unsplash (ver `CREDITOS.md`) y no muestran pacientes ni resultados.
