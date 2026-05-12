ARG LIVEKIT_IMAGE=livekit/livekit-server:v1.9
FROM ${LIVEKIT_IMAGE}

COPY infra/local/livekit/livekit.yaml /etc/livekit/livekit.yaml

CMD ["--config", "/etc/livekit/livekit.yaml"]
