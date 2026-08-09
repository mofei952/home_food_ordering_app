FROM python:3.14-slim
WORKDIR /app

# 默认阿里云 PyPI（海外 VPS 可 build-arg 覆盖为官方源）
# 注意：uv sync --frozen 会按 uv.lock 里的绝对 URL 下载 wheel；
# 锁文件默认指向 files.pythonhosted.org，仅设 UV_INDEX_URL 不够。
# 国内构建时把 artifact host 改写到阿里云 packages 镜像。
ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
ARG PIP_TRUSTED_HOST=mirrors.aliyun.com
# 设为空字符串可跳过改写（海外官方源）：--build-arg UV_PACKAGE_MIRROR=
ARG UV_PACKAGE_MIRROR=https://mirrors.aliyun.com/pypi
ENV PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_TRUSTED_HOST=${PIP_TRUSTED_HOST} \
    UV_INDEX_URL=${PIP_INDEX_URL} \
    UV_DEFAULT_INDEX=${PIP_INDEX_URL}

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN if [ -n "${UV_PACKAGE_MIRROR}" ]; then \
      sed -i "s|https://files.pythonhosted.org|${UV_PACKAGE_MIRROR}|g" uv.lock; \
    fi \
 && uv sync --frozen --no-dev

COPY alembic.ini ./alembic.ini
COPY alembic ./alembic
COPY app ./app
COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
