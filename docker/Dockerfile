# Static ChiaLisp playground: nginx serves the site as-is. No build step.
FROM nginx:1.27-alpine
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY index.html chialisp.json /usr/share/nginx/html/
COPY css /usr/share/nginx/html/css/
COPY js /usr/share/nginx/html/js/
COPY images /usr/share/nginx/html/images/
COPY examples /usr/share/nginx/html/examples/
