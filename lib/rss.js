import BLOG from '@/blog.config'
import { getPostBlocks } from '@/lib/db/getSiteData' // 重新引入这个重要的函数
import { Feed } from 'feed'
import fs from 'fs'
import path from 'path'

/**
 * [决定性修复版]
 * 不再依赖任何HTML渲染或摘要，直接从Notion原始数据块中构建纯文本内容。
 * @param {object} post - 文章对象
 * @returns {Promise<string>} 纯净的文章内容HTML
 */
const createFeedContent = async (post) => {
  // 1. 获取文章最原始的数据块
  const blockMap = await getPostBlocks(post.id, 'rss-content')
  if (!blockMap?.block) {
    // 如果获取不到内容，返回一个友好的提示，而不是空内容
    return `请在网站上查看原文：<a href="${BLOG.LINK}/${post.slug}">${post.title}</a>`
  }

  let content = ''
  // 2. 遍历所有块
  for (const blockId in blockMap.block) {
    const block = blockMap.block[blockId]?.value
    if (block) {
      // 3. 根据块的类型，只提取纯文本
      switch (block.type) {
        case 'header':
        case 'sub_header':
        case 'sub_sub_header':
          // 将标题转换为加粗的段落
          if (block.properties?.title) {
            content += `<p><strong>${block.properties.title.join('')}</strong></p>\n`
          }
          break
        case 'text':
        case 'quote':
        case 'callout':
          // 提取纯文本内容
          if (block.properties?.title) {
            content += `<p>${block.properties.title.join('')}</p>\n`
          }
          break
        // 默认情况下，忽略所有其他类型的块（如图片、视频、分隔线、页面属性等）
        default:
          break
      }
    }
  }
  
  // 4. 返回我们亲手构建的、100%纯净的HTML内容
  return content
}

/**
 * 生成RSS数据 (此部分逻辑不变, 但现在接收的是真正干净的内容)
 * @param {object} props
 */
export async function generateRss(props) {
  const { NOTION_CONFIG, siteInfo, latestPosts } = props
  const TITLE = siteInfo?.title
  const DESCRIPTION = siteInfo?.description
  const LINK = siteInfo?.link || BLOG.LINK
  const AUTHOR = NOTION_CONFIG?.AUTHOR || BLOG.AUTHOR
  const LANG = NOTION_CONFIG?.LANG || BLOG.LANG
  const SUB_PATH = NOTION_CONFIG?.SUB_PATH || BLOG.SUB_PATH
  const CONTACT_EMAIL = NOTION_CONFIG?.CONTACT_EMAIL || BLOG.CONTACT_EMAIL

  const rssPath = path.resolve('./public/rss/feed.xml')
  
  if (isFeedRecentlyUpdated(rssPath, 10)) {
    return
  }

  console.log('[RSS订阅] 生成 /rss/feed.xml')
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

  const latestPostsLimited = latestPosts.slice(0, 10)
  for (const post of latestPostsLimited) {
    const cleanedContent = await createFeedContent(post)

    feed.addItem({
      title: post.title,
      link: `${BLOG.LINK}/${post.slug}`,
      description: cleanedContent.replace(/<[^>]+>/g, '').substring(0, 200), // description 使用纯文本摘要
      content: `<![CDATA[${cleanedContent}]]>`,
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

/**
 * 检查上次更新的辅助函数
 * @param {string} filePath
 * @param {number} intervalMinutes
 * @returns {boolean}
 */
function isFeedRecentlyUpdated(filePath, intervalMinutes = 60) {
  try {
    const stats = fs.statSync(filePath)
    return (Date.now() - stats.mtimeMs) < intervalMinutes * 60 * 1000
  } catch (error) {
    return false
  }
}
