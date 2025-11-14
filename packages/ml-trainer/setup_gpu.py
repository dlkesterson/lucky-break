#!/usr/bin/env python3
"""GPU setup verification and installation helper for Lucky Break ML training."""

from __future__ import annotations

import subprocess
import sys


def check_torch() -> tuple[bool, str]:
    """Check if PyTorch is installed and whether it has CUDA support."""
    try:
        import torch

        version = torch.__version__
        cuda_available = torch.cuda.is_available()

        if cuda_available:
            gpu_name = torch.cuda.get_device_name(0)
            cuda_version = torch.version.cuda
            return True, f"✓ GPU Ready: {gpu_name} (CUDA {cuda_version}, PyTorch {version})"
        else:
            return False, f"⚠ CPU Only: PyTorch {version} (no CUDA support)"

    except ImportError:
        return False, "✗ PyTorch not installed"


def get_cuda_version_recommendation() -> str:
    """Determine recommended CUDA version based on system."""
    try:
        # Try to detect NVIDIA driver version
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            check=False,
        )

        if result.returncode == 0:
            driver_version = result.stdout.strip()
            # Driver 530+ supports CUDA 12.1
            major_version = int(driver_version.split(".")[0])

            if major_version >= 530:
                return "cu121"
            elif major_version >= 450:
                return "cu118"

    except (FileNotFoundError, ValueError):
        pass

    # Default to CUDA 12.1 for modern systems
    return "cu121"


def print_installation_guide(cuda_version: str) -> None:
    """Print installation instructions for PyTorch with CUDA."""
    print("\n" + "=" * 70)
    print("GPU SETUP REQUIRED")
    print("=" * 70)

    print(f"\nRecommended CUDA version: {cuda_version}")
    print("\n1. Uninstall CPU-only PyTorch:")
    print("   pip uninstall torch torchvision torchaudio -y")

    print(f"\n2. Install GPU-enabled PyTorch ({cuda_version}):")

    if cuda_version == "cu121":
        print("   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121")
    else:
        print("   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118")

    print("\n3. Verify installation:")
    print("   python setup_gpu.py")

    print("\n4. Start training with GPU:")
    print("   python train_agent.py --device cuda --timesteps 2000000")

    print("\n" + "=" * 70)
    print("For more details, see: GPU_TRAINING.md")
    print("=" * 70 + "\n")


def print_success_message() -> None:
    """Print success message with training recommendations."""
    print("\n" + "=" * 70)
    print("✓ GPU SETUP COMPLETE")
    print("=" * 70)

    print("\nRecommended training command:")
    print("   python train_agent.py \\")
    print("     --device cuda \\")
    print("     --n-envs 4 \\")
    print("     --batch-size 512 \\")
    print("     --timesteps 2000000")

    print("\nMonitor training progress:")
    print("   tensorboard --logdir runs")

    print("\nFor more options, see:")
    print("   python train_agent.py --help")
    print("   GPU_TRAINING.md")

    print("\n" + "=" * 70 + "\n")


def main() -> None:
    """Main setup verification routine."""
    print("Lucky Break GPU Training Setup")
    print("=" * 70)

    # Check PyTorch installation
    has_gpu, message = check_torch()
    print(f"\n{message}")

    if has_gpu:
        print_success_message()
        sys.exit(0)
    else:
        cuda_version = get_cuda_version_recommendation()
        print_installation_guide(cuda_version)
        sys.exit(1)


if __name__ == "__main__":
    main()
