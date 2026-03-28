FROM ghcr.io/berriai/litellm:v1.82.3-stable.patch.2

COPY litellm_config.yaml /app/config.yaml

EXPOSE 4000

CMD ["--config", "/app/config.yaml", "--port", "4000"]
