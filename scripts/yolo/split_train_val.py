# coding:utf-8

import os
import random
import argparse


def split_dataset(xml_path, txt_path, trainval_percent=0.9, train_percent=0.9, seed=None):
    if seed is not None:
        random.seed(seed)

    total_xml = [f for f in os.listdir(xml_path) if f.endswith('.xml')]
    if not total_xml:
        raise FileNotFoundError(f"在 {xml_path} 未找到 XML 文件")

    os.makedirs(txt_path, exist_ok=True)

    num = len(total_xml)
    list_index = list(range(num))
    tv = int(num * trainval_percent)
    tr = int(tv * train_percent)

    trainval = random.sample(list_index, tv)
    train = random.sample(trainval, tr)

    with open(os.path.join(txt_path, 'trainval.txt'), 'w') as f_trainval, \
            open(os.path.join(txt_path, 'test.txt'), 'w') as f_test, \
            open(os.path.join(txt_path, 'train.txt'), 'w') as f_train, \
            open(os.path.join(txt_path, 'val.txt'), 'w') as f_val:

        for i in list_index:
            name = total_xml[i][:-4] + '\n'
            if i in trainval:
                f_trainval.write(name)
                if i in train:
                    f_train.write(name)
                else:
                    f_val.write(name)
            else:
                f_test.write(name)


def build_parser():
    parser = argparse.ArgumentParser()
    parser.add_argument('--xml_path', default='Annotations', type=str, help='input xml label path')
    parser.add_argument('--txt_path', default='ImageSets/Main', type=str, help='output txt label path')
    parser.add_argument('--trainval_percent', default=0.9, type=float, help='train+val 占比')
    parser.add_argument('--train_percent', default=0.9, type=float, help='train 在 train+val 中占比')
    parser.add_argument('--seed', type=int, help='随机种子 (可选)')
    return parser


if __name__ == '__main__':
    parser = build_parser()
    opt = parser.parse_args()
    split_dataset(
        xml_path=opt.xml_path,
        txt_path=opt.txt_path,
        trainval_percent=opt.trainval_percent,
        train_percent=opt.train_percent,
        seed=opt.seed
    )

