"""Harman: ayırma motorunu bellek sınırıyla başlatır.

mlx-audio-separator komut satırını aynen çalıştırır; yalnızca öncesinde MLX'in bellek
ve önbellek sınırlarını koyar. 8 GB'lık Mac'lerde sınırsız çalışması sistemi donduruyor.

Ortam değişkenleri: HARMAN_MEM_LIMIT_MB (varsayılan 2500), HARMAN_CACHE_LIMIT_MB (varsayılan 256)
"""
import os
import sys

import mlx.core as mx

mx.set_memory_limit(int(os.environ.get("HARMAN_MEM_LIMIT_MB", "2500")) * 1024 * 1024)
mx.set_cache_limit(int(os.environ.get("HARMAN_CACHE_LIMIT_MB", "256")) * 1024 * 1024)

from mlx_audio_separator.utils.cli import main  # noqa: E402

if __name__ == "__main__":
    sys.argv[0] = "mlx-audio-separator"
    main()
