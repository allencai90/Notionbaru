import BLOG from '@/blog.config'
import { getPostBlocks, getGlobalNotionData } from '@/lib/db/getSiteData'
import { Feed } from 'feed'
import fs from 'fs'
import path from 'path'

/**
 * 提取纯净的文本内容作为 RSS 渲染内容
 */
const createFeedContent = async (post) => {
  try {
    const blockMap = await getPostBlocks(post.id, 'rss-content')
    if (!blockMap?.block) {
      return `请在网站上查看原文：<a href="${BLOG.LINK}/${post.slug}">${post.title}</a>`
    }

    // 样式包裹：防止客户端把某些符号、svg、emoji 放大成怪异大块
    let content = '<div style="font-family: system-ui, -apple-system, BlinkMacSystemFont; line-height:1.4; max-width:800px;">'
    content += '<style>img{max-width:100%;height:auto;display:inline-block;} svg{max-width:100%;height:auto;} .icon{font-size:1em;}</style>'

    const removeEmoji = (text) => {
      // 更全面去除 emoji / 表意符号，需 Node 支持 Unicode property escape
      return text.replace(
        /([\p{Emoji_Presentation}\p{Extended_Pictographic}]|[\u2600-\u27BF]|\uFE0F)/gu,
        ''
      )
    }

    const ignoredTypes = [
      'image',
      'page_icon',
      'file',
      'video',
      'embed',
      'bookmark',
      'audio',
      'table_of_contents',
      'callout',
      'toggle'
    ]

    for (const blockId of Object.keys(blockMap.block)) {
      const blockValue = blockMap.block[blockId]?.value
      if (!blockValue) continue

      const type = blockValue.type
      if (ignoredTypes.includes(type)) continue

      if (blockValue.properties?.title) {
        const rawText = blockValue.properties.title.map(item => item[0]).join('')
        const cleanText = removeEmoji(rawText).trim()
        if (!cleanText) continue

        switch (type) {
          case 'header':
            content += `<h3>${cleanText}</h3>`
            break
          case 'sub_header':
            content += `<h4>${cleanText}</h4>`
            break
          case 'sub_sub_header':
            content += `<h5>${cleanText}</h5>`
            break
          default:
            content += `<p>${cleanText}</p>`
            break
        }
      }
    }

    content += '</div>'
    return content
  } catch (e) {
    console.error(`[RSS-Error] Failed to create content for post "${post.title}".`, e)
    return `内容生成失败，请在网站上查看原文：<a href="${BLOG.LINK}/${post.slug}">${post.title}</a>`
  }
}

function isFeedRecentlyUpdated(filePath, intervalMinutes = 60) {
  try {
    const stats = fs.statSync(filePath)
    return (Date.now() - stats.mtimeMs) < intervalMinutes * 60 * 1000
  } catch (error) {
    return false
  }
}

export async function generateRss(props) {
  const { NOTION_CONFIG, siteInfo, latestPosts } = props
  const TITLE = siteInfo?.title || BLOG.TITLE
  const DESCRIPTION = siteInfo?.description || BLOG.DESCRIPTION
  const LINK = siteInfo?.link || BLOG.LINK
  const AUTHOR = NOTION_CONFIG?.AUTHOR || BLOG.AUTHOR
  const LANG = NOTION_CONFIG?.LANG || BLOG.LANG
  const SUB_PATH = NOTION_CONFIG?.SUB_PATH || BLOG.SUB_PATH
  const CONTACT_EMAIL = NOTION_CONFIG?.CONTACT_EMAIL || BLOG.CONTACT_EMAIL

  const rssPath = path.resolve('./public/rss/feed.xml')
  if (isFeedRecentlyUpdated(rssPath, 10)) return

  console.log('[RSS订阅] 正在生成 /rss/feed.xml...')
  const year = new Date().getFullYear()
  const feed = new Feed({
    title: TITLE,
    description: DESCRIPTION,
    link: `${LINK}/${SUB_PATH}`,
    language: LANG,
    favicon: `${LINK}/favicon.png`,
    copyright: `All rights reserved ${year}, ${AUTHOR}`,
    author: { name: AUTHOR, email: CONTACT_EMAIL, link: LINK }
  })

  for (const post of latestPosts.slice(0, 10)) {
    const content = await createFeedContent(post)
    const textOnlyDescription = content.replace(/<[^>]+>/g, '').substring(0, 200)

    feed.addItem({
      title: post.title,
      link: `${BLOG.LINK}/${post.slug}`,
      description: textOnlyDescription,
      content, // feed 库会自己包装成 CDATA
      date: new Date(post?.publishDay),
      image: '' // 明示不要拿第一张图做封面 fallback
    })
  }

  try {
    fs.mkdirSync('./public/rss', { recursive: true })
    fs.writeFileSync(rssPath, feed.rss2())
    fs.writeFileSync(path.resolve('./public/rss/atom.xml'), feed.atom1())
    fs.writeFileSync(path.resolve('./public/rss/feed.json'), feed.json1())
    console.log('[RSS] 写入成功')
  } catch (error) {
    console.warn('[RSS 写入失败] 文件系统可能只读，跳过写入。')
  }
}
