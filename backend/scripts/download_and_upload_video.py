"""
scripts/download_and_upload_video.py

Rebusca o resultado de uma task do Kling já concluída (usando o task_id que
o teste anterior já gerou) e sobe o vídeo pro seu R2, retornando uma URL
curta, pública e estável — sem depender de copiar aquele link gigante e
temporário do Kling.

Como rodar:
    python -m scripts.download_and_upload_video 902811977318269008
"""

import sys
import os
import httpx
import boto3
from botocore.client import Config

KLING_API_KEY = os.environ["KLING_API_KEY"]
KLING_STATUS_URL = "https://api-singapore.klingai.com/v1/videos/image2video/{task_id}"

R2_ACCOUNT_ID = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "clipforge")
R2_PUBLIC_URL = os.environ["R2_PUBLIC_URL"]


def get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def main():
    if len(sys.argv) < 2:
        print("Uso: python -m scripts.download_and_upload_video <task_id>")
        sys.exit(1)

    task_id = sys.argv[1]

    print(f"Buscando o resultado da task {task_id} no Kling...")
    resp = httpx.get(
        KLING_STATUS_URL.format(task_id=task_id),
        headers={"Authorization": f"Bearer {KLING_API_KEY}"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()["data"]

    if data["task_status"] != "succeed":
        print(f"Essa task não está concluída (status: {data['task_status']}).")
        sys.exit(1)

    kling_video_url = data["task_result"]["videos"][0]["url"]
    print(f"URL do Kling (temporária): {kling_video_url[:80]}...")

    print("Baixando o vídeo...")
    video_bytes = httpx.get(kling_video_url, timeout=120).content
    print(f"  {len(video_bytes)} bytes baixados.")

    print("Subindo pro R2...")
    r2_key = f"template-tests/{task_id}.mp4"
    client = get_r2_client()
    client.put_object(
        Bucket=R2_BUCKET_NAME,
        Key=r2_key,
        Body=video_bytes,
        ContentType="video/mp4",
    )

    final_url = f"{R2_PUBLIC_URL}/{r2_key}"
    print("\n" + "=" * 60)
    print("PRONTO — URL curta e estável, sem expiração:")
    print(final_url)
    print("=" * 60)


if __name__ == "__main__":
    main()
