---
id: 19
title: 【教程】Win10解决PS授权限制“This unlicensed Adobe app has been disabled”
date: 2026-11-28
updated:
excerpt: 解决PS授权限制的操作方式和技巧
tags: 教程, 随笔
pinned: false
---
<style>.article-content img{filter:none!important;transform:none!important}.article-content img.annie-image-loading,.article-content img[data-load-failed]{display:block;width:100%;aspect-ratio:auto 16 / 9;object-fit:contain;background-color:var(--color-tag-bg)}</style>

## 一、解决原理 

因为每次启动PS都会联网检测PS软件的授权信息，只要我们阻止联网检测即可。也就是通过系统防火墙 来阻止PS联网检测即可解决弹窗

## 二、操作步骤

1、找开【控制面板】-》【系统安全】-》【防火墙】-》【高级设置】（提示：系统为win10专业版 ，如果其他系统，可能操作路径不同）

<figure><img src="https://picgocloud.com/m/knb7yrbq/d75ad0e1-f8ac-4425-9c93-71369ef9e822.png" alt=""><figcaption></figcaption></figure>

2、先建一个【入站规则】，建好后同样建一个【出站规则】即可

<figure><img src="https://picgocloud.com/m/knb7yrbq/1c9d46d4-3d88-4325-943f-bdda7ca3f453.png" alt=""><figcaption></figcaption></figure>

3、【入站规则】-【新建规则】-【程序】-【下一页】

<figure><img src="https://picgocloud.com/m/knb7yrbq/4138d81e-c69a-48ce-b19f-b43755e8b84c.png" alt=""><figcaption></figcaption></figure>

4、找到PS安装目录，选择【Photoshop .exe】后，下一页（如何找安装目录，在桌面的PS启动图标，点【右键】-【属性】-【快捷方式】-【目标】里可以看到路径。或者【右键】-【打开文件所在的位置】）

<figure><img src="https://picgocloud.com/m/knb7yrbq/15a85607-6ba1-4faa-995b-69d35d1fb2f1.png" alt=""><figcaption></figcaption></figure>

5、【操作】选项、选择【阻止连接】，

<figure><img src="https://picgocloud.com/m/knb7yrbq/78b547d8-d776-4c24-b782-e48bc0a6cd2c.png" alt=""><figcaption></figcaption></figure>

下一页【配置文件 】（默认即可），

再下一页【名称】，名称自定义（为了方便以后记得和修改。最好起一个相关的名称比如【ps_授权】）


6、以上是【入站规则】新建完成，再按同样的方法新建一个【出站规则】即可7、完成后重启一下PS软件，即可。注意：记得要启动防火墙，不然无效，还是会弹出未授权提示

————————————————

## 三、版权声明
本文为CSDN博主「colin5210」的原创文章，遵循<a href="http://creativecommons.org/licenses/by-sa/4.0/"target="_blank" rel="noopener noreferrer"data-confirm-leave="">CC 4.0 BY-SA</a>版权协议，转载请附上原文出处链接及本声明。原文链接：<a href="https://blog.csdn.net/colin5210/article/details/159802845"target="_blank" rel="noopener noreferrer"data-confirm-leave="CSDN">https://blog.csdn.net/colin5210/article/details/159802845</a>

