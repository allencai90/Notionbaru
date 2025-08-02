import BLOG from '@/blog.config'
import { getPostBlocks } from '@/lib/db/getSiteData' // 必须重新引入
import { Feed } from 'feed'
import fs from 'fs'
import path from 'path'

/**
 * [终极方案]
 * 不再依赖任何HTML渲染、摘要或清洗。
 * 直接从Notion最原始的数据块中，只提取纯文本，构建干净的RSS内容。
 * @param {object} post - 文章对象
 * @returns {Promise<string>} 纯净的文章内容HTML
 */
const createFeedContent = async (post) => {
  try {
    // 1. 获取文章最原始的数据块
    const blockMap = await getPostBlocks(post.id, 'rss-content')
    if (!blockMap?.block) {
      return `请在网站上查看原文：<a href="${BLOG.LINK}/${post.slug}">${post.title}</a>`
    }

    let content = ''
    // 2. 遍历所有块
    for (const blockId of Object.keys(blockMap.block)) {
      const blockValue = blockMap.block[blockId]?.value
      if (blockValue && blockValue.properties?.title) {
        // 3. 只要这个块里有 'title' 属性，就代表它有文本。我们只提取它。
        //    这适用于：text, header, sub_header, quote, callout, todo 等。
        //    这会自动忽略：page icon, properties, images, dividers 等没有'title'的块。
        switch (blockValue.type) {
            case 'header':
              content += `<h3>${blockValue.properties.title.join('')}</h3>`
              break
            case 'sub_header':
              content += `<h4>${blockValue.properties.title.join('')}</h4>`
              break
            default:
              content += `<p>${blockValue.properties.title.join('')}</p>`
              break
        }
      }
    }
    return content
  } catch (e) {
    console.error(`[RSS-Error] Failed to create content for post "${post.title}".`, e)
    // 即使发生未知错误，也返回一个无害的链接，而不是让整个部署失败
    return `内容生成失败，请在网站上查看原文：<a href="${BLOG.LINK}/${post.slug}">${post.title}</a>`
  }
}

/**
 * 生成RSS数据 (此部分逻辑不变)
 * @param {object} props
 */
export async function generateRss(props) {
  const { NOTION_CONFIG, siteInfo, latestPosts } = props
  const TITLE = siteInfo?.title, DESCRIPTION = siteInfo?.description, LINK = siteInfo?.link || BLOG.LINK, AUTHOR = NOTION_CONFIG?.AUTHOR || BLOG.AUTHOR, LANG = NOTION_CONFIG?.LANG || BLOG.LANG, SUB_PATH = NOTION_CONFIG?.SUB_PATH || BLOG.SUB_PATH, CONTACT_EMAIL = NOTION_CONFIG?.CONTACT_EMAIL || BLOG.CONTACT_EMAIL

  const rssPath = path.resolve('./public/rss/feed.xml')
  if (isFeedRecentlyUpdated(rssPath, 10)) return

  console.log('[RSS订阅] 生成 /rss/feed.xml')
  const year = new Date().getFullYear()
  const feed = new Feed({
    title: TITLE, description: DESCRIPTION, link: `${LINK}/${SUB_PATH}`, language: LANG, favicon: `${LINK}/favicon.png`, copyright: `All rights reserved ${year}, ${AUTHOR}`, author: { name: AUTHOR, email: CONTACT_EMAIL, link: LINK }
  })

  for (const post of latestPosts.slice(0, 10)) {
    const content = await createFeedContent(post)
    feed.addItem({
      title: post.title,
      link: `${BLOG.LINK}/${post.slug}`,
      description: content.replace(/<[^>]+>/g, '').substring(0, 200),
      content: `<![CDATA[${content}]]>`,
      date: new Date(post?.publishDay)
    })
  }

  try {
    fs.mkdirSync('./public/rss', { recursive: true })
    fs.writeFileSync(rssPath, feed.rss2())
    fs.writeFileSync(path.resolve('./public/rss/atom.xml'), feed.atom1())
    fs.writeFileSync(path.resolve('./public/rss/feed.json'), feed.json1())
  } catch (error) {
    console.warn('[RSS 生成失败] 可能运行在只读文件系统，已跳过写入')
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
