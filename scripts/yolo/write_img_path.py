# -*- coding: utf-8 -*-
import os
from os import getcwd

SETS = ['train', 'val', 'test']


def generate_image_lists(image_sets_dir, output_dir, images_root, image_ext=".jpg"):
    """
    根据 ImageSets/Main 中的划分列表生成对应的数据集清单。

    :param image_sets_dir: 包含 train/val/test 列表的目录
    :param output_dir: 输出 dataSet_path 目录
    :param images_root: 图像根目录，用于组合完整路径
    :param image_ext: 图像扩展名
    """
    os.makedirs(output_dir, exist_ok=True)
    for image_set in SETS:
        split_file = os.path.join(image_sets_dir, f"{image_set}.txt")
        if not os.path.exists(split_file):
            print(f"警告: 找不到 {split_file}")
            continue
        with open(split_file, "r", encoding="utf-8") as fp:
            image_ids = [line.strip() for line in fp if line.strip()]

        list_path = os.path.join(output_dir, f"{image_set}.txt")
        with open(list_path, "w", encoding="utf-8") as list_fp:
            for image_id in image_ids:
                image_path = os.path.join(images_root, f"{image_id}{image_ext}")
                list_fp.write(f"{image_path}\n")
        print(f"生成文件: {list_path}")


if __name__ == "__main__":
    print(getcwd())
    generate_image_lists('ImageSets/Main', 'dataSet_path', '/home/robint01/yolov5_weed/data/data_show/images')

